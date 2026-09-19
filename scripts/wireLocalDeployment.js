/**
 * scripts/wireLocalDeployment.js
 *
 * Deploys the GoldenHour contracts to whatever network Hardhat is pointed at
 * (defaults to "localhost"), then writes the resulting contract addresses
 * into backend/.env and frontend/.env.local so the backend relay and the
 * frontend dapp both pick them up automatically.
 *
 * Usage (from repo root, with `npx hardhat node` already running in another
 * terminal):
 *
 *   node scripts/wireLocalDeployment.js
 *
 * This removes the manual "copy-paste the deploy JSON into three .env files"
 * step that previously blocked a smooth demo.
 */
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const ROOT = path.join(__dirname, "..");
const BACKEND_ENV = path.join(ROOT, "backend", ".env");
const BACKEND_ENV_EXAMPLE = path.join(ROOT, "backend", ".env.example");
const FRONTEND_ENV = path.join(ROOT, "frontend", ".env.local");
const FRONTEND_ENV_EXAMPLE = path.join(ROOT, "frontend", ".env.example");

function upsertEnvFile(filePath, fallbackTemplate, updates) {
  let contents = "";
  if (fs.existsSync(filePath)) {
    contents = fs.readFileSync(filePath, "utf8");
  } else if (fs.existsSync(fallbackTemplate)) {
    contents = fs.readFileSync(fallbackTemplate, "utf8");
  }

  const lines = contents.split("\n").filter((l) => l.length > 0 || true);
  const seen = new Set();

  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match && Object.prototype.hasOwnProperty.call(updates, match[1])) {
      seen.add(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, nextLines.join("\n").replace(/\n{3,}/g, "\n\n"));
  console.log(`Updated ${path.relative(ROOT, filePath)}`);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying from ${deployer.address} on network "${hre.network.name}"...`);

  const Registry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const Access = await hre.ethers.getContractFactory("contracts/AccessControl.sol:AccessControl");
  const access = await Access.deploy(deployer.address, await registry.getAddress());
  await access.waitForDeployment();

  const Records = await hre.ethers.getContractFactory("MedicalRecord");
  const records = await Records.deploy(await access.getAddress(), deployer.address);
  await records.waitForDeployment();

  const Audit = await hre.ethers.getContractFactory("AuditLog");
  const audit = await Audit.deploy(deployer.address);
  await audit.waitForDeployment();

  const Emergency = await hre.ethers.getContractFactory("EmergencyAccess");
  const emergency = await Emergency.deploy(
    await registry.getAddress(),
    await access.getAddress(),
    await audit.getAddress(),
    deployer.address
  );
  await emergency.waitForDeployment();

  await (await access.grantRole(await access.VERIFIER_ROLE(), deployer.address)).wait();
  await (await audit.transferOwnership(await emergency.getAddress())).wait();

  const addresses = {
    REGISTRY_ADDRESS: await registry.getAddress(),
    ACCESS_CONTROL_ADDRESS: await access.getAddress(),
    RECORDS_ADDRESS: await records.getAddress(),
    AUDIT_ADDRESS: await audit.getAddress(),
    EMERGENCY_ADDRESS: await emergency.getAddress(),
  };

  console.log("\nDeployed contract addresses:");
  console.log(JSON.stringify(addresses, null, 2));

  // Backend needs the RPC + relayer key too, so the ChainService actually enables itself.
  upsertEnvFile(BACKEND_ENV, BACKEND_ENV_EXAMPLE, {
    ...addresses,
    RPC_URL: "http://127.0.0.1:8545",
    BACKEND_PRIVATE_KEY: deployer.privateKey || process.env.BACKEND_PRIVATE_KEY || "",
  });

  // Frontend only needs the VITE_-prefixed addresses.
  upsertEnvFile(FRONTEND_ENV, FRONTEND_ENV_EXAMPLE, {
    VITE_REGISTRY_ADDRESS: addresses.REGISTRY_ADDRESS,
    VITE_ACCESS_CONTROL_ADDRESS: addresses.ACCESS_CONTROL_ADDRESS,
    VITE_RECORDS_ADDRESS: addresses.RECORDS_ADDRESS,
    VITE_AUDIT_ADDRESS: addresses.AUDIT_ADDRESS,
    VITE_EMERGENCY_ADDRESS: addresses.EMERGENCY_ADDRESS,
  });

  console.log(
    "\nDone. Restart the backend (npm run backend) and frontend dev server so they pick up the new .env values."
  );

  if (!deployer.privateKey) {
    console.log(
      "\nNOTE: could not auto-detect the deployer's private key from the Hardhat signer object. " +
        "If BACKEND_PRIVATE_KEY in backend/.env is still blank, copy one of the funded private keys " +
        "printed by `npx hardhat node` into that field manually so the backend relay can sign transactions."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
