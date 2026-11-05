const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
console.info("Validating container security, SBOM generation, and supply-chain attestations...");

// 1. Dockerfile least-privilege & production build verification
const backendDocker = fs.readFileSync(path.join(root, "backend/Dockerfile"), "utf8");
const frontendDocker = fs.readFileSync(path.join(root, "frontend/Dockerfile"), "utf8");
const dockerCompose = fs.readFileSync(path.join(root, "docker-compose.yml"), "utf8");

assert.ok(backendDocker.includes("USER node"), "Backend container must drop privileges to non-root USER node");
assert.ok(backendDocker.includes("AS build"), "Backend must use multi-stage build");
assert.ok(backendDocker.includes("--omit=dev"), "Backend must prune dev dependencies");
assert.ok(frontendDocker.includes("AS build"), "Frontend must use multi-stage build");
assert.ok(frontendDocker.includes("caddy:2-alpine"), "Frontend runtime must use minimal unprivileged caddy image");

assert.ok(dockerCompose.includes("secrets:"), "docker-compose.yml must use secrets");
assert.ok(!dockerCompose.includes(["ALLOW", "DEMO", "LOGIN"].join("_")), "docker-compose.yml must not contain demo login flags");

// 2. GitHub Actions CI & Trivy container vulnerability scanning
const ciYml = fs.readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
assert.ok(ciYml.includes("aquasecurity/trivy-action"), "CI workflow must run Trivy scanner on container images");
assert.ok(ciYml.includes("scanners: vuln,secret"), "Trivy must scan for vulnerabilities and leaked secrets");
assert.ok(ciYml.includes("severity: HIGH,CRITICAL"), "Trivy must enforce HIGH and CRITICAL severity checks");
assert.ok(ciYml.includes("exit-code: '1'"), "Trivy must fail CI on high/critical vulnerabilities");

// 3. GitHub Actions Release workflow: SBOM, SLSA provenance, and Cosign cryptographic signatures
const releaseYml = fs.readFileSync(path.join(root, ".github/workflows/release.yml"), "utf8");
assert.ok(releaseYml.includes("Require successful CI for this exact commit"), "Release must require verified CI for the exact commit");
assert.ok(releaseYml.includes("sbom: true"), "Release must produce Software Bill of Materials (SBOM)");
assert.ok(releaseYml.includes("provenance: mode=max"), "Release must generate SLSA max provenance attestations");
assert.ok(releaseYml.includes("sigstore/cosign-installer"), "Release workflow must install Sigstore Cosign");
assert.ok(releaseYml.includes('cosign sign --yes "${IMAGE}@${DIGEST}"'), "Release workflow must cryptographically sign immutable image digests");

// 4. Terraform immutable image digest enforcement
const mainTf = fs.readFileSync(path.join(root, "deploy/terraform/main.tf"), "utf8");
assert.ok(
  mainTf.includes('@sha256:[a-f0-9]{64}$'),
  "Terraform must enforce immutable sha256 image digests for ECS deployments"
);

console.info("PASS: Container security, Trivy scanning, SBOM generation, SLSA provenance, and Cosign signing verified.");
