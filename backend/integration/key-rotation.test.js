const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');
const {Pool}=require('pg');
const encryption=require('../src/services/encryptionService');
const {rotate}=require('../scripts/rotate-legacy-keys');
const {PostgresStore}=require('../src/config/db');
const {EnvelopeEncryptionService}=require('../src/services/envelopeEncryptionService');
test('interrupted key rotation resumes across mixed versions and survives service restart',async t=>{
  const names=['ENCRYPTION_KEY','ENCRYPTION_KEY_ID','ENCRYPTION_KEYRING_JSON','KMS_MASTER_KEY','KMS_MASTER_KEY_ID','KMS_MASTER_KEYRING_JSON'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const pool=new Pool({connectionString:process.env.DATABASE_URL}),client=await pool.connect();
  await client.query('BEGIN');
  t.after(async()=>{await client.query('ROLLBACK');client.release();await pool.end();for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}});
  const oldKey=process.env.RESTORE_TEST_KEY || crypto.randomBytes(32).toString('base64');
  for(const name of names)delete process.env[name];
  process.env.ENCRYPTION_KEY=oldKey;
  const wallets=[crypto.randomUUID(),crypto.randomUUID()];
  for(const wallet of wallets)await client.query('INSERT INTO staff_mfa(wallet,encrypted_secret) VALUES($1,$2)',[wallet,encryption.encryptJson({secret:'synthetic-'+wallet})]);
  const store=new PostgresStore(client),before=new EnvelopeEncryptionService(undefined,store);
  const patientId=crypto.randomUUID();
  await store.addPatient({id:patientId,wallet:'rotation:'+patientId,profile:{},critical:{},createdAt:new Date().toISOString()});
  const payload=await before.encryptField(patientId,{note:'synthetic rotation fixture'});
  process.env.ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  process.env.ENCRYPTION_KEY_ID='next';
  process.env.ENCRYPTION_KEYRING_JSON=JSON.stringify({legacy:oldKey});
  await assert.rejects(rotate({pool:client,afterRow:async()=>{throw new Error('simulated interruption');}}),/interruption/);
  const versions=(await client.query("SELECT DISTINCT coalesce(encrypted_secret->>'keyId','legacy') AS version FROM staff_mfa")).rows.map(row=>row.version);
  assert.ok(versions.includes('legacy'));assert.ok(versions.includes('next'));
  await rotate({pool:client});
  const resumed=await rotate({pool:client});assert.equal(resumed.migrated,0);
  for(const row of (await client.query('SELECT wallet,encrypted_secret FROM staff_mfa WHERE wallet=ANY($1)',[wallets])).rows){
    assert.equal(row.encrypted_secret.keyId,'next');assert.equal(encryption.decryptJson(row.encrypted_secret).secret,'synthetic-'+row.wallet);
  }
  const restarted=new EnvelopeEncryptionService(undefined,new PostgresStore(client));
  assert.equal((await restarted.decryptField(patientId,payload)).note,'synthetic rotation fixture');
  process.env.ENCRYPTION_KEYRING_JSON='{}';
  assert.equal((await new EnvelopeEncryptionService(undefined,store).decryptField(patientId,payload)).note,'synthetic rotation fixture');
  const legacy={...encryption.encryptJson({a:1}),keyId:'missing'};
  assert.throws(()=>encryption.decryptJson(legacy),/historical/);
});

