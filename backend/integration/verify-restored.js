const {Pool} = require("pg");
const {PostgresStore} = require("../src/config/db");
const {EnvelopeEncryptionService} = require("../src/services/envelopeEncryptionService");
async function verify() {
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  try {
    process.env.ENCRYPTION_KEY = process.env.RESTORE_TEST_KEY;
    const service = new EnvelopeEncryptionService(undefined,new PostgresStore(pool));
    const rows = await pool.query("SELECT r.patient_id,o.payload FROM encrypted_objects o JOIN records r ON r.ipfs_cid=o.id::text");
    if (!rows.rowCount) throw new Error("No encrypted fixture to validate");
    for (const row of rows.rows) {
      const restored = await service.decryptField(row.patient_id,row.payload);
      if (restored.value?.note !== "Synthetic clinical data") throw new Error("Restored payload differs");
    }
    console.info("Backup restored into a second database and synthetic clinical payload decrypted successfully.");
  } finally {await pool.end();}
}
verify().catch(() => {console.error("Restore validation failed");process.exitCode=1;});
