const test=require("node:test"),assert=require("node:assert/strict");
const {AwsKmsKeyService}=require("../src/services/awsKmsKeyService");
const arn="arn:aws:kms:ap-south-1:123456789012:key/11111111-1111-1111-1111-111111111111";
test("KMS wraps keys with deployment context, validates key ownership, and separates operator rewrap",async()=>{
 const calls=[],raw=Buffer.alloc(32,8);
 const service=new AwsKmsKeyService({keyId:arn,deployment:"synthetic-hospital",client:{send:async command=>{calls.push(command);return command.constructor.name==="DecryptCommand"?{KeyId:arn,Plaintext:raw}:{KeyId:arn,CiphertextBlob:Buffer.from("synthetic cipher")};}}});
 const wrapped=await service.wrap(raw);assert.deepEqual(await service.unwrap(wrapped),raw);
 assert.equal(calls[0].input.EncryptionContext.deployment,"synthetic-hospital");assert.equal(calls[1].input.KeyId,arn);
 assert.ok((await service.rewrap(wrapped)).startsWith("aws-kms:v1:"));assert.equal(calls.at(-1).constructor.name,"ReEncryptCommand");
 await assert.rejects(service.unwrap(wrapped.slice(0,-4)+"bad"));
 assert.throws(()=>new AwsKmsKeyService({keyId:arn.replace("ap-south-1","us-east-1"),region:"us-east-1",deployment:"synthetic"}));
 const denied=new AwsKmsKeyService({keyId:arn,deployment:"synthetic-hospital",client:{send:async()=>{throw new Error("KMS unavailable");}}});await assert.rejects(denied.unwrap(wrapped),/unavailable/);
});
