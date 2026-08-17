const crypto = require("crypto");
const KEY = () => crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY || "local-development-key").digest();
function encryptJson(value) {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", KEY(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { algorithm: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
function decryptJson(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}
module.exports = { encryptJson, decryptJson };
