const { getJwtSecret, INVALID_PLACEHOLDERS } = require("./authConfig");

function validateStartupConfig() {
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

  // 3. Production environment constraints
  if (process.env.NODE_ENV === "production") {
    if (process.env.DB_SSL !== "true" || process.env.DB_REJECT_UNAUTHORIZED === "false" || (!process.env.DB_CA && !process.env.DB_CA_PEM)) {
      throw new Error("Production requires verified PostgreSQL TLS and DB_CA");
    }
    const database = new URL(process.env.DATABASE_URL);
    if (["sslmode","sslrootcert","sslcert","sslkey","ssl"].some(key => database.searchParams.has(key))) {
      throw new Error("Configure database TLS through DB_CA, not connection string overrides");
    }
    const origin = new URL(process.env.AUTH_URI);
    if (origin.protocol !== "https:" || origin.host !== process.env.AUTH_DOMAIN ||
        origin.origin !== process.env.FRONTEND_ORIGIN) {
      throw new Error("Configure matching HTTPS login and frontend origins");
    }
    if (!process.env.ADMIN_WALLETS) {
      throw new Error("ADMIN_WALLETS environment variable must be configured in production.");
    }
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL must be configured in production.");
    }
  }
}

module.exports = { validateStartupConfig };
