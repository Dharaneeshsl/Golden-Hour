const { getJwtSecret, INVALID_PLACEHOLDERS } = require("./authConfig");

function validateStartupConfig({otpProviderInjected=false}={}) {
  // 1. JWT Secret validation
  const jwtSecret = getJwtSecret();
  if (INVALID_PLACEHOLDERS.includes(jwtSecret)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`CRITICAL: Weak or placeholder JWT_SECRET '${jwtSecret}' is strictly forbidden in production.`);
    }
  }

  // 2. Encryption key validation (32 bytes via base64 or 64 hex chars)
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey) {
    const base64Buf = Buffer.from(encKey, "base64");
    const is32BytesBase64 = base64Buf.length === 32;
    const is64Hex = /^[0-9a-fA-F]{64}$/.test(encKey);
    if (!is32BytesBase64 && !is64Hex) {
      throw new Error("ENCRYPTION_KEY must be a 32-byte base64 string or 64-character hex string.");
    }
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be configured in production.");
  }

  require("../services/encryptionService").getKeySet();

  // 3. Production environment constraints
  if (process.env.NODE_ENV === "production") {
    require("./databaseOptions").databaseOptions();
    if (!otpProviderInjected && process.env.WALLET_AUTH_ENABLED!=="true" && (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_FLOW_ID)) throw new Error("A configured phone OTP provider is required");
    if (!process.env.HOSPITAL_NAME?.trim()) throw new Error("HOSPITAL_NAME is required for a hospital deployment");
    const origin = new URL(process.env.AUTH_URI);
    if (origin.protocol !== "https:" || origin.host !== process.env.AUTH_DOMAIN ||
        origin.origin !== process.env.FRONTEND_ORIGIN) {
      throw new Error("Configure matching HTTPS login and frontend origins");
    }
    if (!process.env.ADMIN_WALLETS && !process.env.ADMIN_USER_IDS) {
      throw new Error("ADMIN_USER_IDS environment variable must be configured in production.");
    }
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be configured in production.");
    }
  }
}

module.exports = { validateStartupConfig };
