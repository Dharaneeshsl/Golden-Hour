const encryption=require("./encryptionService");
function containsReference(value,references){
 if(typeof value==="string")return references.has(value);
 if(Array.isArray(value))return value.some(item=>containsReference(item,references));
 if(value&&typeof value==="object")return Object.values(value).some(item=>containsReference(item,references));
 return false;
}
async function eraseReplayCopies(tx,patient){
 const recovery=(await tx.query("SELECT id,old_wallet,new_wallet FROM patient_recovery_requests WHERE old_wallet=$1 OR new_wallet=$1",[patient.wallet])).rows;
 const references=new Set([patient.id,patient.wallet,...recovery.flatMap(row=>[row.id,row.old_wallet,row.new_wallet])]);
 for(const table of ["records","break_glass_events"]){for(const row of (await tx.query(`SELECT id FROM ${table} WHERE patient_id=$1`,[patient.id])).rows)references.add(row.id);}
 let cursor=["","",""];
 for(;;){
  const rows=(await tx.query("SELECT principal,route,request_key,encrypted_response FROM mutation_requests WHERE (principal,route,request_key)>($1,$2,$3) ORDER BY principal,route,request_key LIMIT 100",cursor)).rows;
  if(!rows.length)break;
  for(const row of rows){
   const response=encryption.decryptJson(row.encrypted_response);
   const raw=Buffer.from(response.body,"base64").toString("utf8");
   let body;try {body=JSON.parse(raw);} catch {body=raw;}
   if(row.principal.startsWith(patient.wallet+":")||containsReference(body,references))await tx.query("DELETE FROM mutation_requests WHERE principal=$1 AND route=$2 AND request_key=$3",[row.principal,row.route,row.request_key]);
  }
  const last=rows.at(-1);cursor=[last.principal,last.route,last.request_key];
 }
 await tx.query("DELETE FROM patient_recovery_requests WHERE old_wallet=$1 OR new_wallet=$1",[patient.wallet]);
}
module.exports={eraseReplayCopies,containsReference};
