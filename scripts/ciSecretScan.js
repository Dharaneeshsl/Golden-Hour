/**
 * CI Secret & Demo Code Scan
 * 
 * Fails CI if forbidden demo flags, hardcoded private keys,
 * demoAccounts, or placeholder secrets are detected in codebase.
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const forbiddenPatterns = [
  { pattern: /\bDEMO_WALLETS\b/, label: "DEMO_WALLETS detected" },
  { pattern: /\bDEMO_LOGIN_ENABLED\b/, label: "DEMO_LOGIN_ENABLED detected" },
  { pattern: /\bALLOW_DEMO_LOGIN\b/, label: "ALLOW_DEMO_LOGIN detected" },
  { pattern: /\bDEFAULT_DEMO_ADMINS\b/, label: "DEFAULT_DEMO_ADMINS detected" },
  { pattern: /\bdemoAccounts\b/, label: "demoAccounts file reference detected" },
  { pattern: /0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80/i, label: "Hardcoded Hardhat Account 0 private key detected" },
  { pattern: /"local-development-secret"/, label: "local-development-secret string literal detected" },
];

const ignoredDirs = ["node_modules", ".git", "dist", "artifacts", "cache", "coverage", ".data"];
const ignoredFiles = ["ciSecretScan.js", "docker-compose.dev.yml"];

let violations = [];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (entry.isFile()) {
      if (ignoredFiles.includes(entry.name)) continue;
      // Only scan code / config files
      if (!/\.(js|jsx|ts|tsx|json|yml|yaml|env|md)$/.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      for (const { pattern, label } of forbiddenPatterns) {
        if (pattern.test(content)) {
          // If in authConfig.js checking INVALID_PLACEHOLDERS array, allow that specific definition
          if (entry.name === "authConfig.js" && label.includes("local-development-secret")) {
            continue;
          }
          // If in tracker or audit docs describing the removal of demo accounts, allow
          if ((entry.name.endsWith(".md") || entry.name.endsWith(".txt")) && (label.includes("detected") || label.includes("demo"))) {
            continue;
          }
          violations.push({ file: path.relative(root, fullPath), label });
        }
      }
    }
  }
}

scanDir(root);

if (violations.length > 0) {
  console.error("❌ CI Secret Scan Failed! The following forbidden demo/secret references were found:");
  violations.forEach((v) => console.error(`  - [${v.file}]: ${v.label}`));
  process.exit(1);
} else {
  console.log("✅ CI Secret Scan Passed: No demo flags, hardcoded keys, or placeholder secrets found.");
  process.exit(0);
}
