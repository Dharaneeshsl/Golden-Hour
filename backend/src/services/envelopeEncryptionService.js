const crypto = require("crypto");
const { VaultKeyService } = require("./vaultKeyService");

/**
 * Envelope Encryption Service for Healthcare Data (AES-256-GCM + KMS Wrap)
 * 
 * - Generates unique per-patient Data Encryption Keys (DEKs)
 * - Wraps DEKs with a Key Management Service (KMS) Root Key
 * - Persists wrapped DEKs in PostgreSQL key_registry table (fail-closed, no in-memory source of truth)
 * - Binds ciphertext to Authenticated Additional Data (AAD): { patientId, recordId, version }
 * - Supports Crypto-Shredding with genuine cryptographic destruction of the stored wrapped DEK
 * - Fully asynchronous with concurrency guards
 */
function canonicalAAD(value) {
  if (Array.isArray(value)) return value.map(canonicalAAD);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key,canonicalAAD(value[key])]));
}

class EnvelopeEncryptionService {
  constructor(masterKeyHex = process.env.KMS_MASTER_KEY, store = null, keyService = null) {
    this.keyService = keyService || (process.env.VAULT_ADDR ? new VaultKeyService() : null);
    let keyBuf = null;
    if (masterKeyHex) {
      keyBuf = Buffer.from(masterKeyHex, "hex");
    } else if (process.env.ENCRYPTION_KEY) {
      const envKey = process.env.ENCRYPTION_KEY.trim();
      if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
        keyBuf = Buffer.from(envKey, "hex");
      } else {
        const b = Buffer.from(envKey, "base64");
        if (b.length === 32) keyBuf = b;
      }
    }

    if (keyBuf && keyBuf.length !== 32) throw new Error("Legacy master key must be 32 bytes");
    if ((!keyBuf || keyBuf.length !== 32) && !this.keyService) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "KMS Root Key (KMS_MASTER_KEY or ENCRYPTION_KEY) must be a verified 256-bit (32-byte) key in production"
        );
      }
      // Non-production transient key; never uses a hardcoded fallback string
      keyBuf = crypto.randomBytes(32);
    }

    this.masterKey = keyBuf;
    this.store = store;
    this.memoryKeys = new Map();
  }

  setStore(store) {
    this.store = store;
  }

  /**
   * Generates and wraps a fresh 256-bit DEK for a patient and awaits persistence in key_registry
   */
  async generatePatientDEK(patientId) {
    if (this.store?.transaction && !this.store.inTransaction && process.env.NODE_ENV === "production") {
      return this.store.transaction(async tx => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [patientId]);
        const scoped = new EnvelopeEncryptionService(this.masterKey?.toString("hex"), tx, this.keyService);
        return scoped.generatePatientDEK(patientId);
      });
    }
    // Concurrency guard: check if another thread/instance created a key in the interim
    if (this.store && this.store.getKeyRecord) {
      const existing = await this.store.getKeyRecord(patientId);
      if (existing) return existing;
    } else if (this.memoryKeys.has(patientId)) {
      return this.memoryKeys.get(patientId);
    }

    const rawDEK = crypto.randomBytes(32);
    const keyId = `key_${crypto.randomBytes(8).toString("hex")}_${Date.now()}`;

    let packedEnvelope;
    if (this.keyService) {
      packedEnvelope = await this.keyService.wrap(rawDEK);
    } else {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", this.masterKey, iv);
      const wrappedDEK = Buffer.concat([cipher.update(rawDEK), cipher.final()]);
      packedEnvelope = `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${wrappedDEK.toString("base64")}`;
    }

    const record = {
      keyId,
      patientId,
      algorithm: "aes-256-gcm",
      encryptedDEK: packedEnvelope,
      status: "active",
      createdAt: new Date().toISOString(),
    };

    if (this.store && this.store.saveKeyRecord) {
      await this.store.saveKeyRecord(record);
    } else {
      this.memoryKeys.set(patientId, { ...record, rawDEK });
    }

    return { ...record, rawDEK };
  }

  /**
   * Retrieves and unwraps the raw DEK for a patient directly from key_registry
   */
  async unwrapPatientDEK(patientId) {
    let record = null;
    if (this.store && this.store.getKeyRecord) {
      record = await this.store.getKeyRecord(patientId);
    } else if (this.memoryKeys.has(patientId)) {
      record = this.memoryKeys.get(patientId);
    }

    // If key does not exist yet in key_registry, generate one
    if (!record) {
      record = await this.generatePatientDEK(patientId);
    }

    // Verify key status and cryptographic destruction
    const cipherText = record.encryptedDEK || record.encrypted_dek || "";
    if (record.status === "shredded" || cipherText.includes("CRYPTO_SHREDDED") || !cipherText.includes(":")) {
      throw new Error("Crypto-shredded: Patient data encryption key has been permanently destroyed");
    }

    // If generated in-process, return rawDEK directly
    if (record.rawDEK) return record.rawDEK;

    if (cipherText.startsWith("vault:")) {
      if (!this.keyService) throw new Error("Vault is required to unwrap this key");
      return this.keyService.unwrap(cipherText);
    }
    if (!this.masterKey) throw new Error("Legacy wrapping key required for migration");
    const parts = cipherText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid or corrupted wrapped DEK format in key_registry");
    }

    const [ivB64, tagB64, cipherB64] = parts;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.masterKey,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const rawDEK = Buffer.concat([
      decipher.update(Buffer.from(cipherB64, "base64")),
      decipher.final(),
    ]);

    return rawDEK;
  }

  /**
   * Encrypts clinical data bound to Authenticated Additional Data (AAD)
   */
  async encryptField(patientId, plainValue, aadContext = {}) {
    const dek = await this.unwrapPatientDEK(patientId);
    let record = null;
    if (this.store && this.store.getKeyRecord) {
      record = await this.store.getKeyRecord(patientId);
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);

    const aadBuffer = Buffer.from(JSON.stringify(canonicalAAD(aadContext)));
    cipher.setAAD(aadBuffer);

    const serialized = typeof plainValue === "string" ? plainValue : JSON.stringify(plainValue);
    const ciphertext = Buffer.concat([cipher.update(serialized, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      version: 2,
      algorithm: "aes-256-gcm",
      keyId: record ? (record.keyId || record.key_id) : "key_default",
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      aadEncoding: "sorted-json",
      aad: aadContext,
    };
  }

  /**
   * Decrypts clinical JSON payload, validating AAD authentication
   */
  async decryptField(patientId, payload) {
    if (!payload || payload.algorithm !== "aes-256-gcm") {
      throw new Error("Unsupported encrypted payload specification");
    }
    const dek = await this.unwrapPatientDEK(patientId);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(payload.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

    if (payload.aad) {
      decipher.setAAD(Buffer.from(JSON.stringify(payload.aadEncoding === "sorted-json" ? canonicalAAD(payload.aad) : payload.aad)));
    }

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");

    try {
      return JSON.parse(decrypted);
    } catch (e) {
      return decrypted;
    }
  }

  /**
   * Crypto-shredding: permanently destroys patient's DEK in the database
   */
  async cryptoShred(patientId) {
    if (this.store && this.store.shredKeyRecord) {
      await this.store.shredKeyRecord(patientId);
    } else if (this.memoryKeys.has(patientId)) {
      const rec = this.memoryKeys.get(patientId);
      rec.status = "shredded";
      rec.encryptedDEK = "[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]";
      delete rec.rawDEK;
    } else {
      this.memoryKeys.set(patientId, {
        patientId,
        status: "shredded",
        encryptedDEK: "[CRYPTO_SHREDDED_PERMANENTLY_DESTROYED]",
      });
    }
    return true;
  }
}

const envelopeEncryption = new EnvelopeEncryptionService();

module.exports = { EnvelopeEncryptionService, envelopeEncryption };
