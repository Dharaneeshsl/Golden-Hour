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

const DEFAULT_DEMO_ADMINS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0xeF4C5fa4f9b9fFD908d5b422Dd1C3eEd3D9F749c",
];

function getAdminWallets() {
  const raw = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (raw.length === 0 && process.env.NODE_ENV !== "production") {
    return DEFAULT_DEMO_ADMINS.map(canonicalizeWallet);
  }
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
};
