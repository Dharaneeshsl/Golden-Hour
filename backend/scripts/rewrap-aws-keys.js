const {Pool}=require("pg");
const {databaseOptions}=require("../src/config/databaseOptions");
const {PostgresStore}=require("../src/config/db");
const {AwsKmsKeyService}=require("../src/services/awsKmsKeyService");
const {EnvelopeEncryptionService}=require("../src/services/envelopeEncryptionService");
async function rewrap({pool,keyService}={}){
 const owned=!pool;pool ||=new Pool(databaseOptions());
 try{
  const service=keyService||new AwsKmsKeyService(),store=new PostgresStore(pool),local=new EnvelopeEncryptionService(process.env.KMS_MASTER_KEY,store,service);
  let cursor="",changed=0;
  for(;;){
   const rows=(await pool.query("SELECT key_id,encrypted_dek FROM key_registry WHERE key_id>$1 AND status='active' ORDER BY key_id LIMIT 100",[cursor])).rows;
   if(!rows.length)return {changed};
   for(const row of rows){
    let wrapped;
    if(row.encrypted_dek.startsWith("aws-kms:"))wrapped=await service.rewrap(row.encrypted_dek);
    else if(row.encrypted_dek.startsWith("vault:"))throw new Error("Migrate Vault-held keys using an approved operator with both key providers available");
    else{const raw=await local.unwrapKeyRecord({encryptedDEK:row.encrypted_dek,status:"active"});try{wrapped=await service.wrap(raw);}finally{raw.fill(0);}}
    const result=await pool.query("UPDATE key_registry SET encrypted_dek=$3,rotated_at=now() WHERE key_id=$1 AND encrypted_dek=$2 AND status='active'",[row.key_id,row.encrypted_dek,wrapped]);changed+=result.rowCount;
   }
   cursor=rows.at(-1).key_id;
  }
 }finally{if(owned)await pool.end();}
}
if(require.main===module){if(!process.argv.includes("--apply"))throw new Error("Operator credentials and --apply are required");rewrap().then(value=>console.info(JSON.stringify(value))).catch(()=>{console.error("KMS rewrap stopped. Retain old keys and investigate before resuming.");process.exitCode=1;});}
module.exports={rewrap};
