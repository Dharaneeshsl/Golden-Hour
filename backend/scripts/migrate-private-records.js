// Explicit operator-run migration. Run on a restored staging copy before production.
const crypto = require("crypto");
const {Pool} = require("pg");
const legacy = require("../src/services/ipfsService");
const {canonicalJsonStringify} = require("../src/controllers/recordController");
const {getDbSslConfig} = require("../src/config/migrate");

async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:getDbSslConfig()});
  try {
    const records = await pool.query("SELECT id,ipfs_cid,encrypted_hash FROM records ORDER BY id");
    for (const record of records.rows) {
      if (/^[a-f0-9-]{36}$/i.test(record.ipfs_cid)) {
        const existing = await pool.query("SELECT 1 FROM encrypted_objects WHERE id=$1",[record.ipfs_cid]);
        if (existing.rowCount) continue;
      }
      const payload = await legacy.fetchEncrypted(record.ipfs_cid);
      const hash = crypto.createHash("sha256").update(canonicalJsonStringify(payload)).digest("hex");
      if (hash !== record.encrypted_hash) throw new Error("Legacy record integrity check failed");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query("SELECT ipfs_cid FROM records WHERE id=$1 FOR UPDATE",[record.id]);
        if (current.rows[0]?.ipfs_cid === record.ipfs_cid) {
          const id = crypto.randomUUID();
          await client.query("INSERT INTO encrypted_objects(id,payload) VALUES ($1,$2)",[id,payload]);
          await client.query("UPDATE records SET ipfs_cid=$2 WHERE id=$1",[record.id,id]);
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
