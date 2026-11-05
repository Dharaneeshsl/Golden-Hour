// Explicit operator-run migration. Run on a restored staging copy before production.
const crypto = require("crypto");
const {Pool} = require("pg");
const encryption = require("../src/services/encryptionService");
const {EnvelopeEncryptionService} = require("../src/services/envelopeEncryptionService");
const {PostgresStore} = require("../src/config/db");
const legacy = require("./legacyIpfsReader");
const {canonicalJsonStringify} = require("../src/controllers/recordController");
const {databaseOptions} = require("../src/config/migrate");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new Pool(databaseOptions());
  try {
    const keys = new EnvelopeEncryptionService(process.env.KMS_MASTER_KEY,new PostgresStore(pool));
    const records = await pool.query("SELECT id,patient_id,ipfs_cid,encrypted_hash FROM records ORDER BY id");
    for (const record of records.rows) {
      let payload;
      let wasPrivate = false;
      if (/^[a-f0-9-]{36}$/i.test(record.ipfs_cid)) {
        const existing = await pool.query("SELECT payload FROM encrypted_objects WHERE id=$1",[record.ipfs_cid]);
        if (existing.rowCount) {payload=existing.rows[0].payload;wasPrivate=true;}
      }
      payload ??= await legacy.fetchEncrypted(record.ipfs_cid);
      const originalHash = crypto.createHash("sha256").update(canonicalJsonStringify(payload)).digest("hex");
      if (originalHash !== record.encrypted_hash) throw new Error("Legacy record integrity check failed");
      if (payload.version===2) {
        if (payload.aad?.patientId!==record.patient_id || payload.aad?.recordId!==record.id) throw new Error("Record binding mismatch");
        if (wasPrivate) continue;
      } else {
        const clinicalData = encryption.decryptJson(payload);
        payload = await keys.encryptField(record.patient_id,{value:clinicalData},{patientId:record.patient_id,recordId:record.id,version:2});
      }
      const hash = crypto.createHash("sha256").update(canonicalJsonStringify(payload)).digest("hex");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query("SELECT ipfs_cid FROM records WHERE id=$1 FOR UPDATE",[record.id]);
        if (current.rows[0]?.ipfs_cid === record.ipfs_cid) {
          const id = crypto.randomUUID();
          await client.query("INSERT INTO encrypted_objects(id,payload) VALUES ($1,$2)",[id,payload]);
          await client.query("UPDATE records SET ipfs_cid=$2,encrypted_hash=$3 WHERE id=$1",[record.id,id,hash]);
          if (wasPrivate) await client.query("DELETE FROM encrypted_objects WHERE id=$1",[record.ipfs_cid]);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {client.release();}
    }
    console.info("Private copy migration complete. Verify every record through the application before cutover.");
  } finally {await pool.end();}
}
if (require.main === module) migrate().catch(() => {console.error("Migration stopped. Inspect database state before retrying.");process.exitCode=1;});
module.exports={migrate};
