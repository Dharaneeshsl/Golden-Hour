const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const tfBinary = process.platform === "win32"
  ? path.join(root, ".tools", "terraform", "terraform.exe")
  : "terraform";

console.info("Validating India-region infrastructure templates & security policies...");

// 1. Static policy checks on Terraform configuration
const mainTfPath = path.join(root, "deploy", "terraform", "main.tf");
assert.ok(fs.existsSync(mainTfPath), "deploy/terraform/main.tf must exist");
const mainTf = fs.readFileSync(mainTfPath, "utf8");

assert.ok(mainTf.includes('region = "ap-south-1"'), "Target region must be India (ap-south-1)");
assert.ok(mainTf.includes("storage_encrypted"), "Databases must enforce storage encryption");
assert.ok(mainTf.includes("backup_retention_period"), "Databases must have explicit backup retention");
assert.ok(mainTf.includes("deletion_protection"), "Databases must enforce deletion protection");
assert.ok(mainTf.includes("aws_cloudwatch_log_group"), "Log groups must be provisioned");
assert.ok(mainTf.includes("retention_in_days"), "Log retention must be explicitly configured");
assert.ok(mainTf.includes("aws_kms_key"), "KMS key management must be configured");

// 2. Execute automated terraform test suite
if (fs.existsSync(tfBinary) || process.platform !== "win32") {
  const tfResult = spawnSync(tfBinary, ["-chdir=deploy/terraform", "test"], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  });

  const output = (tfResult.stdout || "") + (tfResult.stderr || "");
  if (tfResult.status !== 0) {
    console.error("Terraform test failed:\n", output);
    process.exit(1);
  }
  assert.ok(output.includes("Success!"), "Terraform security tests must report Success");
  console.info("PASS: Terraform security test suite (private databases, KMS, log retention, multi-AZ, isolated roles)");
} else {
  console.info("PASS: Static infrastructure policies verified (Terraform binary not found for mock execution)");
}
