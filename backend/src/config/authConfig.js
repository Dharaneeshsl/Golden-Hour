const { canonicalizeWallet } = require("./db");

function getJwtSecret() {
  const value = process.env.JWT_SECRET;
  const invalidPlaceholders = [
    "local-development-secret",
    "replace-with-a-long-random-secret",
    "your-secret-key-here",
  ];
  if (!value || invalidPlaceholders.includes(value)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("A strong, non-placeholder JWT_SECRET must be configured in production");
    }
    return value || "local-development-secret-fallback-dev-only";
  }
  return value;
}

function getAdminWallets() {
  return (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map(canonicalizeWallet);
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
};
