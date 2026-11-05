const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {canonicalAuditPayload}=require('../src/services/auditChainService');
const {verifySegment,csvCell,auditCsv,auditPdf}=require('../src/services/auditExportService');

test('audit segment verification detects changed data and rejects a different anchor',()=>{
 const row={id:crypto.randomUUID(),patient_id:null,actor:'synthetic',action:'TEST',details:{_hashEncoding:'canonical-json-v2'},created_at:new Date().toISOString(),previous_hash:'0'.repeat(64),sequence_num:1};
 row.current_hash=crypto.createHash('sha256').update(canonicalAuditPayload(row.id,null,row.actor,row.action,row.details,row.created_at,row.previous_hash)).digest('hex');
 assert.equal(verifySegment([row]).valid,true);
 assert.equal(verifySegment([{...row,action:'CHANGED'}]).valid,false);
 assert.equal(verifySegment([row],'a'.repeat(64)).valid,false);
 assert.match(csvCell(' =HYPERLINK("bad")'),/^"'/);
});

test('historical-wallet audit events preserve hash chain while attributing to migrated user IDs in CSV and PDF',async()=>{
 const historicalActor='0x1234567890123456789012345678901234567890';
 const migratedUserId='user-uuid-1111-2222-3333-444455556666';
 const row={
  id:crypto.randomUUID(),
  patient_id:null,
  actor:historicalActor,
  actor_user_id:migratedUserId, // Joined via LEFT JOIN identities
  action:'PATIENT_ENROLLED',
  details:{_hashEncoding:'canonical-json-v2'},
  created_at:new Date().toISOString(),
  previous_hash:'0'.repeat(64),
  sequence_num:1
 };
 row.current_hash=crypto.createHash('sha256').update(canonicalAuditPayload(row.id,null,row.actor,row.action,row.details,row.created_at,row.previous_hash)).digest('hex');
 
 // The hash verification passes because canonicalAuditPayload binds row.actor (preserving immutability)
 const segmentReport=verifySegment([row]);
 assert.equal(segmentReport.valid,true);

 // CSV contains both the historical wallet and the attributed actor_user_id
 const csv=auditCsv([row]);
 assert.ok(csv.includes(historicalActor),'CSV should contain historical actor wallet');
 assert.ok(csv.includes(migratedUserId),'CSV should contain attributed actor_user_id');

 // PDF renders cleanly as a valid PDF binary
 const pdf=await auditPdf([row],segmentReport);
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
 assert.ok(pdf.length>500,'PDF should contain rendered page content');
});

test('audit report renders an actual bounded PDF',async()=>{
 const pdf=await auditPdf([],{valid:true,checked:0,scope:'Synthetic empty segment'});
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length<100000);
});
