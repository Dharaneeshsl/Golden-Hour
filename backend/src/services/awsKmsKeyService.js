const {KMSClient,EncryptCommand,DecryptCommand,ReEncryptCommand}=require("@aws-sdk/client-kms");
function validArn(value,region){return typeof value==="string"&&new RegExp(`^arn:aws:kms:${region}:\\d{12}:key/[a-f0-9-]{36}$`).test(value);}
class AwsKmsKeyService{
 constructor({keyId=process.env.AWS_KMS_KEY_ID,region=process.env.AWS_REGION || "ap-south-1",deployment=process.env.KMS_DEPLOYMENT_ID,previous=process.env.AWS_KMS_PREVIOUS_KEY_IDS || "",client}={}){
  if(!["ap-south-1","ap-south-2"].includes(region)||!validArn(keyId,region)||!/^[a-zA-Z0-9_-]{3,100}$/.test(deployment||""))throw new Error("Configure an India-region KMS key ARN and non-sensitive deployment ID");
  this.keyId=keyId;this.context={application:"GoldenHour",deployment};this.allowed=new Set([keyId,...previous.split(",").map(value=>value.trim()).filter(Boolean)]);
  if([...this.allowed].some(value=>!validArn(value,region)))throw new Error("Historical KMS keys must belong to the configured India region");
  this.client=client || new KMSClient({region,maxAttempts:2});
 }
 async call(command){return this.client.send(command,{abortSignal:AbortSignal.timeout(5000)});}
 pack(result){
  if(result.KeyId!==this.keyId||!result.CiphertextBlob?.length||result.CiphertextBlob.length>6144)throw new Error("Invalid KMS wrapping response");
  return "aws-kms:v1:"+Buffer.from(JSON.stringify({keyId:result.KeyId,ciphertext:Buffer.from(result.CiphertextBlob).toString("base64")})).toString("base64");
 }
 unpack(value){
  if(typeof value!=="string"||value.length>12000||!value.startsWith("aws-kms:v1:"))throw new Error("Invalid KMS envelope");
  let result;try{result=JSON.parse(Buffer.from(value.slice(11),"base64").toString("utf8"));}catch{throw new Error("Invalid KMS envelope");}
  if(!this.allowed.has(result.keyId)||typeof result.ciphertext!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(result.ciphertext))throw new Error("KMS key is not approved for this deployment");
  const blob=Buffer.from(result.ciphertext,"base64");if(!blob.length||blob.length>6144)throw new Error("Invalid KMS envelope");
  return {keyId:result.keyId,blob};
 }
 async wrap(raw){if(!Buffer.isBuffer(raw)||raw.length!==32)throw new Error("A 32-byte patient key is required");return this.pack(await this.call(new EncryptCommand({KeyId:this.keyId,Plaintext:raw,EncryptionContext:this.context,EncryptionAlgorithm:"SYMMETRIC_DEFAULT"})));}
 async unwrap(value){const packed=this.unpack(value);const result=await this.call(new DecryptCommand({KeyId:packed.keyId,CiphertextBlob:packed.blob,EncryptionContext:this.context,EncryptionAlgorithm:"SYMMETRIC_DEFAULT"}));const raw=Buffer.from(result.Plaintext||[]);if(result.KeyId!==packed.keyId||raw.length!==32)throw new Error("Invalid KMS decryption response");return raw;}
 async rewrap(value){const packed=this.unpack(value);return this.pack(await this.call(new ReEncryptCommand({SourceKeyId:packed.keyId,CiphertextBlob:packed.blob,SourceEncryptionContext:this.context,DestinationKeyId:this.keyId,DestinationEncryptionContext:this.context})));}
}
module.exports={AwsKmsKeyService};
