const fs=require("fs");
const crypto=require("crypto");
const {Pool}=require("pg");
const {PostgresStore}=require("../src/config/db");
const {EnvelopeEncryptionService}=require("../src/services/envelopeEncryptionService");
const encryption=require("../src/services/encryptionService");
const {canonicalJsonStringify}=require("../src/controllers/recordController");
async function verify() {
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  try {
    process.env.ENCRYPTION_KEY=process.env.RESTORE_TEST_KEY;
    const service=new EnvelopeEncryptionService(undefined,new PostgresStore(pool));
    const rows=(await pool.query("SELECT r.id,r.patient_id,o.payload FROM encrypted_objects o JOIN records r ON r.ipfs_cid=o.id::text ORDER BY r.id")).rows;
    if (!rows.length || !process.env.RESTORE_EXPECTED_FILE) throw new Error("Restore fixture manifest unavailable");
    const manifest=[];
    for (const row of rows) {
      const value=row.payload.version===2 ? (await service.decryptField(row.patient_id,row.payload)).value : encryption.decryptJson(row.payload);
      manifest.push({id:row.id,hash:crypto.createHash("sha256").update(canonicalJsonStringify(value)).digest("hex")});
    }
    if (process.argv.includes("--snapshot")) {
      fs.writeFileSync(process.env.RESTORE_EXPECTED_FILE,JSON.stringify(manifest));
      console.info("Recorded encrypted restore fixture manifest.");
    } else {
      if (JSON.stringify(manifest)!==fs.readFileSync(process.env.RESTORE_EXPECTED_FILE,"utf8")) throw new Error("Restored data differs from pre-backup data");
      console.info("Backup restored into a second database; every fixture record decrypted and matched its pre-backup content hash.");
    }
  } finally {await pool.end();}
}
verify().catch(()=>{console.error("Restore validation failed");process.exitCode=1;});
