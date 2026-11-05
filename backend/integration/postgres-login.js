const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet } = require("ethers");
const request = require("supertest");
const { Pool } = require("pg");
const { PostgresStore } = require("../src/config/db");
const { createApp } = require("../src/app");

test("replicas accept only the issued challenge, exactly once", async t => {
  assert.ok(process.env.DATABASE_URL);
  const apps = [];
  const stores = [];
  for (let i = 0; i < 2; i++) {
    const pool = new Pool({connectionString: process.env.DATABASE_URL});
    t.after(() => pool.end());
    const store = new PostgresStore(pool);
    stores.push(store);
    apps.push(request(await createApp({store})));
  }
  const wallet = Wallet.createRandom();
  const route = "/api/auth/nonce/" + wallet.address;
  const {body} = await apps[0].get(route).expect(200);
  const verify = (app, signature, message) =>
    app.post("/api/auth/verify").send({wallet: wallet.address, signature, message});
  const altered = body.message.replace(body.domain, "other.example");
  await verify(apps[1], await wallet.signMessage(altered), altered).expect(401);
  const signature = await wallet.signMessage(body.message);
  const responses = await Promise.all(apps.map(app => verify(app, signature, body.message)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200,401]);
  await stores[0].saveChallenge(wallet.address, body.message, new Date(0));
  await verify(apps[1], signature, body.message).expect(401);
});

test("rotated cards, conflicting edits and emergency reads through hospital APIs", async t => {
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  t.after(() => pool.end());
  // Run production application paths against the isolated loopback test database.
  // The injected test pool deliberately does not exercise deployment TLS.
  const admin = Wallet.createRandom(), doctor = Wallet.createRandom(), patient = Wallet.createRandom();
  const settings = {
    NODE_ENV:"production", AUTH_URI:"https://hospital.example", AUTH_DOMAIN:"hospital.example",
    FRONTEND_ORIGIN:"https://hospital.example", DB_SSL:"true", DB_CA:"injected-test-pool",
    ADMIN_WALLETS:admin.address, JWT_SECRET:require("crypto").randomBytes(48).toString("hex"),
    ENCRYPTION_KEY:process.env.RESTORE_TEST_KEY || require("crypto").randomBytes(32).toString("base64")
  };
  for (const [key, value] of Object.entries(settings)) {
    const original = process.env[key];
    process.env[key] = value;
    t.after(() => { if (original === undefined) delete process.env[key]; else process.env[key] = original; });
  }
  const app = request(await createApp({store:new PostgresStore(pool)}));

  const recovery = new Map();
  async function login(wallet) {
    const {body} = await app.get("/api/auth/nonce/" + wallet.address).expect(200);
    const signature = await wallet.signMessage(body.message);
    const response = await app.post("/api/auth/verify").send({wallet:wallet.address,signature}).expect(200);
    if (!response.body.mfaRequired) return "Bearer " + response.body.token;
    const ticket = response.body.mfaToken;
    await app.get("/api/operations").set("Authorization","Bearer " + ticket).expect(401);
    let code;
    if (response.body.enrollmentRequired) {
      const setup = await app.post("/api/auth/mfa/setup").send({mfaToken:ticket}).expect(200);
      code = require("../src/services/mfaService").totp(setup.body.secret,wallet.address).generate();
    } else code = recovery.get(wallet.address).pop();
    const verified = await app.post("/api/auth/mfa/complete").send({mfaToken:ticket,code}).expect(200);
    await app.post("/api/auth/mfa/complete").send({mfaToken:ticket,code}).expect(401);
    if (verified.body.recoveryCodes) recovery.set(wallet.address,verified.body.recoveryCodes);
    return "Bearer " + verified.body.token;
  }
  const patientAuth = await login(patient);
  const enrollment = await app.post("/api/patients").set("Authorization",patientAuth)
    .send({profile:{name:"Synthetic patient"},critical:{allergies:[]}}).expect(201);
  const id = enrollment.body.id;
  const edit = () => app.put("/api/patients/" + id).set("Authorization",patientAuth)
    .send({revision:1,critical:{allergies:["synthetic test value"]}});
  assert.deepEqual((await Promise.all([edit(),edit()])).map(r => r.status).sort(),[200,409]);
  const issue = () => app.post("/api/patients/me/card").set("Authorization",patientAuth).expect(201);
  const oldCard = (await issue()).body.token, activeCard = (await issue()).body.token;
  let doctorAuth = await login(doctor);
  const invite = await app.post("/api/doctors/invitations").set("Authorization",await login(admin))
    .send({wallet:doctor.address}).expect(201);
  await app.post("/api/doctors/register").set("Authorization",doctorAuth)
    .send({name:"Synthetic doctor",licenseNumber:"TEST",specialty:"Emergency",invitationToken:invite.body.token}).expect(201);
  doctorAuth = await login(doctor);
  await app.post("/api/doctors/" + doctor.address + "/verify").set("Authorization", await login(admin)).expect(200);
  await app.post("/api/consents/" + id).set("Authorization",patientAuth).send({wallet:doctor.address}).expect(201);
  const record = await app.post("/api/records").set("Authorization",doctorAuth)
    .send({patientId:id,recordType:"Test",clinicalData:{note:"Synthetic clinical data"}}).expect(201);
  const read = await app.get("/api/records/" + id + "/" + record.body.id).set("Authorization",doctorAuth).expect(200);
  assert.equal(read.body.clinicalData.note,"Synthetic clinical data");
  const archive = await app.get("/api/compliance/me/archive").set("Authorization",patientAuth).expect(200);
  assert.equal(archive.body.records[0].clinicalData.note,"Synthetic clinical data");
  await app.get("/api/compliance/me/archive").set("Authorization",doctorAuth).expect(403);
  const object = await pool.query("SELECT payload FROM encrypted_objects WHERE id=$1",[record.body.ipfsCid]);
  assert.equal(object.rows[0].payload.version,2);
  assert.ok(!JSON.stringify(object.rows[0]).includes("Synthetic clinical data"));
  const emergency = cardToken => app.post("/api/emergency-access").set("Authorization",doctorAuth)
    .send({cardToken,justification:"Synthetic drill for card rotation"});
  await emergency(oldCard).expect(404);
  const event = await emergency(activeCard).expect(200);
  assert.ok(!JSON.stringify(event.body).includes("Synthetic drill"));
  const path = "/api/emergency-access/critical/" + event.body.accessId;
  const view = await app.get(path).set("Authorization",doctorAuth).expect(200);
  assert.deepEqual(view.body.critical.allergies,["synthetic test value"]);
  const adminAuth = await login(admin);
  const review = () => app.post("/api/emergency-access/reviews/" + event.body.accessId)
    .set("Authorization",adminAuth).send({decision:"approved"});
  await review().expect(201);
  await review().expect(409);
  const pending = await app.get("/api/emergency-access/reviews/pending").set("Authorization",adminAuth).expect(200);
  assert.ok(!pending.body.some(row => row.id === event.body.accessId));
  await app.put("/api/operations").set("Authorization",patientAuth).send({enrollment_paused:true,emergency_paused:true}).expect(403);
  await app.put("/api/operations").set("Authorization",adminAuth).send({enrollment_paused:true,emergency_paused:true}).expect(200);
  await app.get(path).set("Authorization",doctorAuth).expect(503);
  await app.put("/api/operations").set("Authorization",adminAuth).send({enrollment_paused:false,emergency_paused:false}).expect(200);
  const timings = await Promise.all(Array.from({length:25},async () => {
    const started = performance.now();
    const result = await app.get(path).set("Authorization",doctorAuth).expect(200);
    assert.equal(result.body.patientId,id);
    return performance.now()-started;
  }));
  timings.sort((a,b) => a-b);
  const p95 = timings[Math.ceil(timings.length*0.95)-1];
  console.info("Local synthetic critical-read load: 25 concurrent reads, p95=" + Math.round(p95) + "ms, 0 errors.");
  const integrity = await new (require("../src/services/auditChainService").AuditChainService)(new PostgresStore(pool)).verifyChainIntegrity();
  assert.equal(integrity.valid,true,JSON.stringify(integrity));
  await pool.query("UPDATE audit_logs SET expires_at=now() WHERE id=$1",[event.body.accessId]);
  await app.get(path).set("Authorization",doctorAuth).expect(410);
  const replacement = Wallet.createRandom();
  const replacementAuth = await login(replacement);
  const recoveryRequest = await app.post("/api/recovery").set("Authorization",replacementAuth)
    .send({oldWallet:patient.address,proofReference:"Synthetic hospital case RECOVERY-1"}).expect(202);
  const reviewPath = "/api/recovery/" + recoveryRequest.body.id + "/review";
  await app.post(reviewPath).set("Authorization",doctorAuth).send({decision:"approve",identityVerified:true}).expect(403);
  await app.post(reviewPath).set("Authorization",adminAuth).send({decision:"approve",identityVerified:true}).expect(200);
  await app.post(reviewPath).set("Authorization",adminAuth).send({decision:"approve",identityVerified:true}).expect(409);
  const secondAdmin = Wallet.createRandom();
  process.env.ADMIN_WALLETS += "," + secondAdmin.address;
  const secondAdminAuth = await login(secondAdmin);
  const completed = await app.post(reviewPath).set("Authorization",secondAdminAuth).send({decision:"approve",identityVerified:true}).expect(200);
  assert.equal(completed.body.requestStatus,"completed");
  await app.get("/api/patients/me").set("Authorization",patientAuth).expect(401);
  const recovered = await app.get("/api/patients/me").set("Authorization",await login(replacement)).expect(200);
  assert.equal(recovered.body.id,id);

});

test("runtime grants prevent audit mutation and schema changes", async t => {
  const fs = require("fs");
  const path = require("path");
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  const client = await pool.connect();
  const role = "gh_runtime_" + require("crypto").randomBytes(8).toString("hex");
  await client.query("CREATE ROLE " + role);
  t.after(async () => {
    client.release();
    await pool.end();
    const cleanup = new Pool({connectionString:process.env.DATABASE_URL});
    try {
      await cleanup.query("DROP OWNED BY " + role);
      await cleanup.query("DROP ROLE " + role);
    } finally { await cleanup.end(); }
  });
  const grants = fs.readFileSync(path.join(__dirname,"../../deploy/runtime-grants.sql"),"utf8")
    .split("\n").filter(line => !line.startsWith("\\")).join("\n")
    .replaceAll(':"runtime_role"',role);
  await client.query(grants);
  await client.query("SET ROLE " + role);
  try {
    await assert.rejects(client.query("DELETE FROM audit_events"), /permission denied/i);
    await assert.rejects(client.query("UPDATE audit_events SET actor='changed'"), /permission denied/i);
    await assert.rejects(client.query("ALTER TABLE patients ADD COLUMN forbidden text"), /owner/i);
    await client.query("SELECT * FROM patients LIMIT 1");
  } finally { await client.query("RESET ROLE"); }
});

test("HTTP throttles are shared across API instances",async t => {
  const {PostgresRateLimitStore} = require("../src/services/rateLimitStore");
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  t.after(() => pool.end());
  const store = new PostgresStore(pool);
  const stores = [new PostgresRateLimitStore(store,"test"),new PostgresRateLimitStore(store,"test")];
  stores.forEach(limiter => limiter.init({windowMs:60000}));
  const results = await Promise.all(Array.from({length:20},(_,i) => stores[i%2].increment("synthetic-client")));
  assert.deepEqual(results.map(r => r.totalHits).sort((a,b)=>a-b),Array.from({length:20},(_,i)=>i+1));
  await stores[1].resetKey("synthetic-client");
  assert.equal((await stores[0].increment("synthetic-client")).totalHits,1);
});
