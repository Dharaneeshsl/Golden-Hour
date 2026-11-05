const fs=require("fs/promises");
const {createStore}=require("./config/db");
const {OutboxService}=require("./services/outboxService");
const {setTimeout:pause}=require("timers/promises");
async function run() {
  const store=await createStore();
  const abort=new AbortController();
  for (const signal of ["SIGTERM","SIGINT"]) process.on(signal,()=>abort.abort());
  let lastCleanup=0;
  try {
    while (!abort.signal.aborted) {
      const results=await new OutboxService(store).processPending();
      if (Date.now()-lastCleanup>60000) {
        for (const table of ["http_rate_limits","login_challenges","mfa_challenges","phone_login_challenges","staff_invitations","mutation_requests","patient_archive_exports"]) {
          await store.query(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE expires_at<now() LIMIT 1000)`);
        }
        await store.query("DELETE FROM encrypted_objects WHERE created_at<now()-interval '24 hours' AND NOT EXISTS (SELECT 1 FROM records WHERE ipfs_cid=encrypted_objects.id::text)");
        const depth=(await store.query("SELECT count(*) FILTER (WHERE status IN ('pending','processing')) AS pending,count(*) FILTER (WHERE status='failed') AS failed FROM outbox")).rows[0];
        console.info(JSON.stringify({event:"queue_depth",pending:Number(depth.pending),failed:Number(depth.failed)}));
        lastCleanup=Date.now();
      }
      await fs.writeFile("/tmp/goldenhour-worker-health",String(Date.now()));
      if (results.length) console.info(JSON.stringify({event:"worker_batch",count:results.length,failed:results.filter(row=>row.status==="failed").length}));
      try {await pause(1000,undefined,{signal:abort.signal});} catch {if (!abort.signal.aborted) throw new Error("Worker scheduling failure");}
    }
  } finally {await store.pool.end();}
}
run().catch(()=>{console.error(JSON.stringify({event:"worker_failed"}));process.exitCode=1;});
