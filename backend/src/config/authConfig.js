const { canonicalizeWallet } = require("./db");

const INVALID_PLACEHOLDERS = [
  "local-development-secret",
  "replace-with-a-long-random-secret",
  "your-secret-key-here",
  "local-development-secret-fallback-dev-only",
  "dev-only-change-me-in-production-please",
];

function getJwtSecret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET must be configured in environment");
    }
    return "dev-non-production-fallback-key-32-chars-long";
  }

  if (INVALID_PLACEHOLDERS.includes(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Weak or placeholder JWT_SECRET is strictly forbidden in production");
    }
  }

  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }

  return value;
}

function getAdminWallets() {
  const raw = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return raw.map(canonicalizeWallet);
}

function isCurrentAdmin(wallet) {
  if (!wallet) return false;
  const admins = getAdminWallets();
  return admins.includes(canonicalizeWallet(wallet));
}

module.exports = {
  getJwtSecret,
  getAdminWallets,
  isCurrentAdmin,
  INVALID_PLACEHOLDERS,
};
