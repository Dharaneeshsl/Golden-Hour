const crypto = require("crypto");

/**
 * Envelope Encryption Service for Healthcare Data (AES-256-GCM + KMS Wrap)
 * 
 * - Generates unique per-patient Data Encryption Keys (DEKs)
 * - Wraps DEKs with a Key Management Service (KMS) Root Key
 * - Binds ciphertext to Authenticated Additional Data (AAD): { patientId, recordId, version }
 * - Supports Crypto-Shredding (deleting the DEK renders all ciphertexts permanently unreadable)
 */

class EnvelopeEncryptionService {
  constructor(masterKeyHex = process.env.KMS_MASTER_KEY) {
    if (!masterKeyHex) {
      // Default to deterministic derivation from ENCRYPTION_KEY if KMS_MASTER_KEY is not explicitly passed
      const baseKey = process.env.ENCRYPTION_KEY || "goldenhour-master-key-seed-value";
      this.masterKey = crypto.createHash("sha256").update(baseKey).digest();
    } else {
      this.masterKey = Buffer.from(masterKeyHex, "hex");
    }
    // In-memory key registry fallback for unit testing / local instances
    this.keyStore = new Map();
  }

  /**
   * Generates and wraps a fresh 256-bit DEK for a patient
   */
  generatePatientDEK(patientId) {
    const rawDEK = crypto.randomBytes(32);
    const keyId = `key_${crypto.randomBytes(8).toString("hex")}_${Date.now()}`;
    
    // Encrypt DEK with Master KMS Key
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
    const wrappedDEK = Buffer.concat([cipher.update(rawDEK), cipher.final()]);
    const tag = cipher.getAuthTag();

    const record = {
      keyId,
      patientId,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      encryptedDEK: wrappedDEK.toString("base64"),
      status: "active",
      createdAt: new Date().toISOString(),
    };

    this.keyStore.set(patientId, { ...record, rawDEK });
    return record;
  }

  /**
   * Retrieves and unwraps the raw DEK for a patient
   */
  unwrapPatientDEK(patientId) {
    const record = this.keyStore.get(patientId);
    if (!record) {
      // Generate lazily if not present
      this.generatePatientDEK(patientId);
      return this.keyStore.get(patientId).rawDEK;
    }
    if (record.status === "shredded") {
      throw new Error("Crypto-shredded: Patient data encryption key has been permanently destroyed");
    }
    if (record.rawDEK) return record.rawDEK;

    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      Buffer.from(record.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(record.encryptedDEK, "base64")),
      decipher.final(),
    ]);
  }

  /**
   * Encrypts clinical JSON bound to Authenticated Additional Data (AAD)
   */
  encryptField(patientId, plainValue, aadContext = {}) {
    const dek = this.unwrapPatientDEK(patientId);
    const record = this.keyStore.get(patientId);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);

    const aadBuffer = Buffer.from(JSON.stringify(aadContext));
    cipher.setAAD(aadBuffer);

    const serialized = typeof plainValue === "string" ? plainValue : JSON.stringify(plainValue);
    const ciphertext = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 2,
      algorithm: "aes-256-gcm",
      keyId: record.keyId,
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      aad: aadContext,
    };
  }

  /**
   * Decrypts clinical JSON payload, validating AAD authentication
   */
  decryptField(patientId, payload) {
    if (!payload || payload.algorithm !== "aes-256-gcm") {
      throw new Error("Unsupported encrypted payload specification");
    }
    const dek = this.unwrapPatientDEK(patientId);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(payload.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

    if (payload.aad) {
      decipher.setAAD(Buffer.from(JSON.stringify(payload.aad)));
    }

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  /**
   * Crypto-shreds all patient data by destroying the patient DEK
   */
  cryptoShred(patientId) {
    const record = this.keyStore.get(patientId);
    if (record) {
      record.status = "shredded";
      delete record.rawDEK;
      record.encryptedDEK = "";
      return true;
    }
    return false;
  }
}

module.exports = {
  EnvelopeEncryptionService,
  envelopeEncryption: new EnvelopeEncryptionService(),
};
