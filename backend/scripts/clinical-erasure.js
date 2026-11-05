const {Pool} = require("pg");
const {PostgresStore} = require("../src/config/db");
const {getDbSslConfig} = require("../src/config/migrate");
const {erasePatient,replayLedger} = require("../src/services/erasureService");

async function main() {
  if (!process.argv.includes("--apply")) throw new Error("Review hospital policy and backups before using --apply");
  const url = process.env.ERASURE_LEDGER_WRITE_URL;
  if (!url || !process.env.DATABASE_URL) throw new Error("Operator database and ledger credentials required");
  const primary = new URL(process.env.DATABASE_URL), external = new URL(url);
  if (primary.host===external.host && primary.pathname===external.pathname) throw new Error("Use an independent ledger database");
  const pool = new Pool({connectionString:primary.href,ssl:getDbSslConfig()});
  const ledger = new Pool({connectionString:external.href,ssl:getDbSslConfig()});
  try {
    const store = new PostgresStore(pool);
    if (process.argv.includes("--replay")) console.info("Applied erasure receipts:",await replayLedger(store,ledger));
    else {
      if (!/^\d+$/.test(process.env.PATIENT_RETENTION_DAYS || "")) throw new Error("PATIENT_RETENTION_DAYS required");
      console.info(await erasePatient(store,ledger,{requestId:process.env.ERASURE_REQUEST_ID,
        retentionDays:Number(process.env.PATIENT_RETENTION_DAYS),approvalReference:process.env.ERASURE_APPROVAL_REFERENCE}));
    }
  } finally {await pool.end();await ledger.end();}
}
main().catch(() => {console.error("Erasure stopped. Inspect holds, retention policy, approval and ledger state before retrying.");process.exitCode=1;});
