const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("crypto");
const {ethers}=require("ethers");
const request=require("supertest");
const {Pool}=require("pg");
const {PostgresStore}=require("../src/config/db");
const {createApp}=require("../src/app");
const {ensurePhoneUser}=require("../src/services/phoneAuthService");
const {totp}=require("../src/services/mfaService");

test("phone identity, cookies, atomic failures and concurrent idempotent writes",async t=>{
  const previous={};
  const settings={NODE_ENV:"production",HOSPITAL_NAME:"Synthetic reliability hospital",AUTH_DOMAIN:"hospital.test",AUTH_URI:"https://hospital.test",DB_SSL:"true",DB_CA:"",REQUIRE_STAFF_MFA:"true",STAFF_INVITE_ONLY:"true",ADMIN_WALLETS:"",
    JWT_SECRET:crypto.randomBytes(32).toString("hex"),
    ENCRYPTION_KEY:process.env.RESTORE_TEST_KEY || crypto.randomBytes(32).toString("base64"),FRONTEND_ORIGIN:"https://hospital.test"};
  for (const [key,value] of Object.entries(settings)) {previous[key]=process.env[key];process.env[key]=value;}
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  t.after(async()=>{await pool.end();for (const key of Object.keys(settings)) {if (previous[key]===undefined) delete process.env[key];else process.env[key]=previous[key];}});
  const store=new PostgresStore(pool),codes=new Map(),recovery=new Map();
  const phone=()=>"+91"+String(9000000000+crypto.randomInt(0,1000000000));
  const adminPhone=phone(),doctorPhone=phone(),patientPhone=phone(),failedPhone=phone();
  const adminUser=await ensurePhoneUser(store,adminPhone);
  const oldAdmin=process.env.ADMIN_USER_IDS;process.env.ADMIN_USER_IDS=adminUser.id;
  t.after(()=>{if (oldAdmin===undefined) delete process.env.ADMIN_USER_IDS;else process.env.ADMIN_USER_IDS=oldAdmin;});
  const app=await createApp({store,otpProvider:{send:async ({phone,code})=>codes.set(phone,code)}});
  async function login(number) {
    const sent=await request(app).post("/api/auth/phone/request").send({phone:number}).expect(202);
    assert.equal(sent.body.code,undefined);
    let result=await request(app).post("/api/auth/phone/verify").send({challengeId:sent.body.challengeId,code:codes.get(number)}).expect(200);
    await request(app).post("/api/auth/phone/verify").send({challengeId:sent.body.challengeId,code:codes.get(number)}).expect(401);
    if (result.body.mfaRequired) {
      const ticket=result.body.mfaToken;
      let code;
      if (result.body.enrollmentRequired) {
        const setup=await request(app).post("/api/auth/mfa/setup").send({mfaToken:ticket}).expect(200);
        code=totp(setup.body.secret,"staff").generate();
      } else code=recovery.get(number).pop();
      result=await request(app).post("/api/auth/mfa/complete").send({mfaToken:ticket,code}).expect(200);
      if (result.body.recoveryCodes) recovery.set(number,result.body.recoveryCodes);
    }
    assert.equal(result.body.token,undefined);
    const cookie=result.headers["set-cookie"].find(value=>value.startsWith("gh_access="));
    assert.match(cookie,/HttpOnly/);
    return {cookie:cookie.split(";")[0],user:result.body.user};
  }

  // Fault coverage: Challenge expiry and 5-attempt lockout
  const expPhone=phone();
  const expSent=await request(app).post("/api/auth/phone/request").send({phone:expPhone}).expect(202);
  await pool.query("UPDATE phone_login_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expSent.body.challengeId]);
  await request(app).post("/api/auth/phone/verify").send({challengeId:expSent.body.challengeId,code:codes.get(expPhone)}).expect(401);

  const lockPhone=phone();
  const lockSent=await request(app).post("/api/auth/phone/request").send({phone:lockPhone}).expect(202);
  for(let i=0;i<5;i++)await request(app).post("/api/auth/phone/verify").send({challengeId:lockSent.body.challengeId,code:"000000"}).expect(401);
  await request(app).post("/api/auth/phone/verify").send({challengeId:lockSent.body.challengeId,code:codes.get(lockPhone)}).expect(401);
  await pool.query("DELETE FROM http_rate_limits");

  const authorized=(client,method,path)=>request(app)[method](path).set("Cookie",client.cookie).set("Origin",settings.FRONTEND_ORIGIN);
  const admin=await login(adminPhone);
  const invitation=await authorized(admin,"post","/api/doctors/invitations").send({phone:doctorPhone}).expect(201);
  let doctor=await login(doctorPhone);
  await authorized(doctor,"post","/api/doctors/register").send({name:"Synthetic clinician",licenseNumber:"TEST",specialty:"Emergency",invitationToken:invitation.body.token}).expect(201);
  doctor=await login(doctorPhone);
  await authorized(admin,"post","/api/doctors/"+doctor.user.wallet+"/verify").expect(200);

  const patient=await login(patientPhone),failure=await login(failedPhone);
  const trigger="reject_clinical_"+crypto.randomBytes(6).toString("hex");
  await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.actor='${failure.user.wallet}' OR (NEW.actor='${doctor.user.wallet}' AND NEW.action IN ('RECORD_CREATED','RECORD_VIEWED')) THEN
        RAISE EXCEPTION 'Synthetic audit outage';
      END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
  t.after(async()=>{const cleanup=new Pool({connectionString:process.env.DATABASE_URL});try {await cleanup.query(`DROP TRIGGER IF EXISTS ${trigger} ON audit_events`);await cleanup.query(`DROP FUNCTION IF EXISTS ${trigger}()`);} finally {await cleanup.end();}});
  const failed=await authorized(failure,"post","/api/patients").send({profile:{name:"Synthetic rollback"},critical:{}});
  assert.ok(failed.status>=500);
  assert.equal(await store.patientByWallet(failure.user.wallet),null);
  const key=crypto.randomUUID(),body={profile:{name:"Synthetic idempotent patient"},critical:{allergies:[]}};
  const enroll=()=>authorized(patient,"post","/api/patients").set("Idempotency-Key",key).send(body);
  const enrollments=await Promise.all([enroll(),enroll()]);
  assert.deepEqual(enrollments.map(result=>result.status),[201,201]);
  assert.equal(enrollments[0].body.id,enrollments[1].body.id);
  const id=enrollments[0].body.id;
  await authorized(patient,"post","/api/patients").set("Idempotency-Key",key).send({...body,profile:{name:"Changed request"}}).expect(409);
  assert.equal(Number((await pool.query("SELECT count(*) FROM patients WHERE wallet=$1",[patient.user.wallet])).rows[0].count),1);
  await authorized(patient,"post","/api/consents/"+id).send({phone:doctorPhone}).expect(201);
  const input={patientId:id,recordType:"Synthetic report",clinicalData:{note:"Synthetic clinical data"}};
  const rejected=await authorized(doctor,"post","/api/records").set("Idempotency-Key",crypto.randomUUID()).send(input);
  assert.ok(rejected.status>=500);
  assert.equal((await store.recordsForPatient(id)).length,0);
  assert.equal(Number((await pool.query("SELECT count(*) FROM encrypted_objects WHERE payload->'aad'->>'patientId'=$1",[id])).rows[0].count),0);
  await pool.query(`ALTER TABLE audit_events DISABLE TRIGGER ${trigger}`);
  const recordKey=crypto.randomUUID();
  const writes=await Promise.all([0,1,2].map(()=>authorized(doctor,"post","/api/records").set("Idempotency-Key",recordKey).send(input)));
  assert.ok(writes.every(result=>result.status===201));
  assert.equal(new Set(writes.map(result=>result.body.id)).size,1);
  assert.equal((await store.recordsForPatient(id)).length,1);
  const recordId=writes[0].body.id;

  // Dropped-response replay and rollback fault coverage
  const replayedWrite=await authorized(doctor,"post","/api/records").set("Idempotency-Key",recordKey).send(input).expect(201);
  assert.equal(replayedWrite.headers["idempotency-replayed"],"true");
  assert.equal(replayedWrite.body.id,recordId);
  await authorized(doctor,"post","/api/records").set("Idempotency-Key",recordKey).send({...input,recordType:"Altered Type"}).expect(409);

  const retryKey=crypto.randomUUID();
  await authorized(doctor,"post","/api/records").set("Idempotency-Key",retryKey).send({...input,recordType:{invalid:true}}).expect(400);
  assert.equal((await pool.query("SELECT 1 FROM mutation_requests WHERE request_key=$1",[retryKey])).rowCount,0);
  const retriedWrite=await authorized(doctor,"post","/api/records").set("Idempotency-Key",retryKey).send(input).expect(201);
  assert.ok(retriedWrite.body.id);

  await pool.query(`ALTER TABLE audit_events ENABLE TRIGGER ${trigger}`);
  const denied=await authorized(doctor,"get","/api/records/"+id+"/"+recordId);
  assert.ok(denied.status>=500);assert.equal(denied.body.clinicalData,undefined);
  await pool.query(`ALTER TABLE audit_events DISABLE TRIGGER ${trigger}`);
  await authorized(doctor,"get","/api/records/"+id+"/"+recordId).expect(200);
  assert.ok((await store.auditForPatient(id)).some(event=>event.action==="RECORD_VIEWED"));
  await authorized(doctor,"get","/api/records/"+id+"?limit=-1").expect(400);
  await authorized(doctor,"post","/api/records").send({...input,recordType:{invalid:true}}).expect(400);
  for(let index=0;index<6;index++)await authorized(doctor,"post","/api/records").send({...input,clinicalData:{note:"Synthetic archive row "+index}}).expect(201);
  const firstArchive=await authorized(patient,"get","/api/compliance/me/archive").expect(200);
  assert.equal(firstArchive.body.records.length,5);assert.ok(firstArchive.body.nextCursor);
  const snapshotIds=(await store.recordsForPatient(id)).map(row=>row.id).sort();
  const later=await authorized(doctor,"post","/api/records").send({...input,clinicalData:{note:"Added after export snapshot"}}).expect(201);
  const archiveIds=firstArchive.body.records.map(row=>row.id);let archiveCursor=firstArchive.body.nextCursor,pages=0;
  while(archiveCursor){
    assert.ok(++pages<100,"archive pagination must terminate");
    const page=await authorized(patient,"get","/api/compliance/me/archive?cursor="+encodeURIComponent(archiveCursor)).expect(200);
    assert.ok(Buffer.byteLength(JSON.stringify(page.body))<1024*1024);archiveIds.push(...page.body.records.map(row=>row.id));archiveCursor=page.body.nextCursor;
  }
  assert.deepEqual(archiveIds.sort(),snapshotIds);assert.ok(!archiveIds.includes(later.body.id));
  await authorized(failure,"post","/api/patients").send({profile:{name:"Synthetic other archive owner"},critical:{}}).expect(201);
  await authorized(failure,"get","/api/compliance/me/archive?cursor="+encodeURIComponent(firstArchive.body.nextCursor)).expect(409);
  const changeExport=await authorized(patient,"get","/api/compliance/me/archive").expect(200);
  const revision=(await store.patientById(id)).revision;
  await authorized(patient,"put","/api/patients/"+id).send({revision,critical:{allergies:["Synthetic revised"]}}).expect(200);
  await authorized(patient,"get","/api/compliance/me/archive?cursor="+encodeURIComponent(changeExport.body.nextCursor)).expect(409);

  // Deletion mid-export check
  const midExport=await authorized(patient,"get","/api/compliance/me/archive").expect(200);
  assert.ok(midExport.body.nextCursor);
  const recordsBeforeDelete=await store.recordsForPatient(id);
  await pool.query("DELETE FROM records WHERE id=$1",[recordsBeforeDelete[0].id]);
  await authorized(patient,"get","/api/compliance/me/archive?cursor="+encodeURIComponent(midExport.body.nextCursor)).expect(409);

  const expiredExport=await authorized(patient,"get","/api/compliance/me/archive").expect(200);
  const manifest=JSON.parse(Buffer.from(expiredExport.body.nextCursor,"base64url").toString());
  await pool.query("UPDATE patient_archive_exports SET expires_at=now()-interval '1 second' WHERE id=$1",[manifest.exportId]);
  await authorized(patient,"get","/api/compliance/me/archive?cursor="+encodeURIComponent(expiredExport.body.nextCursor)).expect(409);
  await authorized(patient,"get","/api/compliance/audit-export").expect(403);
  const exported=await authorized(admin,"get","/api/compliance/audit-export?limit=2").expect(200);
  assert.equal(exported.body.report.valid,true);assert.equal(exported.body.report.checked,2);assert.ok(exported.body.nextCursor);
  const pdf=await authorized(admin,"get","/api/compliance/audit-export?format=pdf&limit=2").expect(200);
  assert.equal(Buffer.from(pdf.body.content,"base64").subarray(0,5).toString(),"%PDF-");
  await authorized(admin,"get","/api/compliance/audit-export?limit=501").expect(400);
  assert.ok((await pool.query("SELECT count(*) FROM audit_events WHERE action='ADMIN_AUDIT_EXPORTED'")).rows[0].count>=2);

  // Historical-wallet audit attribution via Postgres identities join
  const histWallet="0x"+crypto.randomBytes(20).toString("hex").toLowerCase();
  const histChecksummed=ethers.getAddress(histWallet);
  const histUserId=crypto.randomUUID();
  await pool.query("INSERT INTO users(id,full_name,status) VALUES ($1,'Historical Clinician','active')",[histUserId]);
  await pool.query("INSERT INTO identities(id,user_id,provider_type,identifier) VALUES ($1,$2,'wallet',$3)",[crypto.randomUUID(),histUserId,histWallet]);
  const auditRow=await (new (require("../src/services/auditChainService").AuditChainService)(store)).appendAuditEvent({actor:histWallet,action:"HISTORICAL_RECORD_MIGRATED",details:{migrated:true}});
  const auditSeq=(await pool.query("SELECT sequence_num FROM audit_events WHERE id=$1",[auditRow.id])).rows[0].sequence_num;
  const histExport=await authorized(admin,"get","/api/compliance/audit-export?format=csv&after="+(Number(auditSeq)-1)+"&limit=10").expect(200);
  assert.equal(histExport.body.report.valid,true);
  assert.ok(histExport.body.content.includes(histChecksummed));
  assert.ok(histExport.body.content.includes(histUserId));

  await request(app).post("/api/patients").set("Cookie",patient.cookie).set("Origin","https://untrusted.example").send(body).expect(403);
});
