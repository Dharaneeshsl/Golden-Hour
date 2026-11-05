const {Pool} = require("pg");
const {VaultKeyService} = require("../src/services/vaultKeyService");
const {EnvelopeEncryptionService} = require("../src/services/envelopeEncryptionService");
const {databaseOptions} = require("../src/config/migrate");
const {PostgresStore} = require("../src/config/db");

async function rewrap() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const vault = new VaultKeyService();
  const pool = new Pool(databaseOptions());
  try {
    const store = new PostgresStore(pool);
    const legacy = new EnvelopeEncryptionService(process.env.KMS_MASTER_KEY, store, vault);
    const rows = await pool.query("SELECT key_id,patient_id,encrypted_dek FROM key_registry WHERE status='active' ORDER BY key_id");
    for (const row of rows.rows) {
      let ciphertext;
      if (row.encrypted_dek.startsWith("vault:")) {
        ciphertext = await vault.rewrap(row.encrypted_dek);
      } else {
        // Unwrap through the existing reader while retaining the historical master key.
        const raw = await legacy.unwrapKeyRecord({encryptedDEK:row.encrypted_dek,status:"active"});
        try { ciphertext = await vault.wrap(raw); } finally {raw.fill(0);}
      }
      await pool.query("UPDATE key_registry SET encrypted_dek=$3,rotated_at=now() WHERE key_id=$1 AND encrypted_dek=$2 AND status='active'",
        [row.key_id,row.encrypted_dek,ciphertext]);
    }
    console.info("Key rewrap pass completed. Verify restored records before retiring old key versions.");
  } finally {await pool.end();}
}
if (require.main === module) rewrap().catch(() => {console.error("Key migration stopped. Retain old key versions and investigate.");process.exitCode=1;});
module.exports={rewrap};
