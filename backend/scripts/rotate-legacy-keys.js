const {Pool}=require("pg");
const {databaseOptions}=require("../src/config/migrate");
const {PostgresStore}=require("../src/config/db");
const encryption=require("../src/services/encryptionService");
const {EnvelopeEncryptionService}=require("../src/services/envelopeEncryptionService");
const {migrate}=require("./migrate-private-records");
async function rotate({pool,afterRow}={}) {
  const owned=!pool;
  pool ||= new Pool(databaseOptions());
  try {
    if (owned) await migrate();
    const store=new PostgresStore(pool),active=encryption.getKeySet().activeId;
    const specifications=[
      {table:"staff_mfa",keys:["wallet"],column:"encrypted_secret"},
      {table:"patient_recovery_requests",keys:["id"],column:"encrypted_reference"},
      {table:"mutation_requests",keys:["principal","route","request_key"],column:"encrypted_response"}
    ];
    let migrated=0;
    for (const specification of specifications) {
      const {table,keys,column}=specification;
      const rows=(await pool.query(`SELECT ${keys.join(",")},${column} FROM ${table}`)).rows;
      for (const row of rows) {
        if (row[column].keyId===active) continue;
        const payload=encryption.encryptJson(encryption.decryptJson(row[column]));
        const values=keys.map(key=>row[key]);
        values.push(payload,row[column]);
        await pool.query(`UPDATE ${table} SET ${column}=$${values.length-1} WHERE ${keys.map((key,index)=>key+"=$"+(index+1)).join(" AND ")} AND ${column}=$${values.length}`,values);
        migrated++;
        if (afterRow) await afterRow(migrated);
      }
    }
    const wrapping=new EnvelopeEncryptionService(process.env.KMS_MASTER_KEY,store);
    const keys=(await pool.query("SELECT key_id,patient_id,encrypted_dek FROM key_registry WHERE status='active'")).rows;
    for (const row of keys) {
      if ((row.encrypted_dek.startsWith("vault:") || row.encrypted_dek.startsWith("aws-kms:"))) continue;
      const raw=await wrapping.unwrapKeyRecord({encryptedDEK:row.encrypted_dek,status:"active"});
      try {
        const encrypted=wrapping.wrapLocal(raw);
        await pool.query("UPDATE key_registry SET encrypted_dek=$3,rotated_at=now() WHERE key_id=$1 AND encrypted_dek=$2 AND status='active'",[row.key_id,row.encrypted_dek,encrypted]);
      } finally {raw.fill(0);}
    }
    return {migrated};
  } finally {if (owned) await pool.end();}
}
if (require.main===module) {
  if (!process.argv.includes("--apply") || !process.env.DATABASE_URL) throw new Error("Operator credentials and --apply required");
  rotate().then(result=>console.info(result)).catch(()=>{console.error("Key rotation stopped. Retain old key versions and resume after investigation.");process.exitCode=1;});
}
module.exports={rotate};
