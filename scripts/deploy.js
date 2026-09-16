const hre = require("hardhat");

function resolveRelayAddress(privateKey, fallbackAddress) {
  return privateKey ? new hre.ethers.Wallet(privateKey).address : fallbackAddress;
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const relayKey = process.env.BACKEND_PRIVATE_KEY;
  const relayAddress = resolveRelayAddress(relayKey, deployer.address);

  if (!relayKey) {
    console.warn("BACKEND_PRIVATE_KEY is not set; using deployer as the relay address for this deployment.");
  }

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

  if (relayAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    await (await registry.transferOwnership(relayAddress)).wait();
    await (await access.grantRole(await access.VERIFIER_ROLE(), relayAddress)).wait();
    await (await records.transferOwnership(relayAddress)).wait();
    await (await emergency.transferOwnership(relayAddress)).wait();
  } else {
    await (await access.grantRole(await access.VERIFIER_ROLE(), deployer.address)).wait();
  }

  // EmergencyAccess is the sole writer for the audit contract.
  await (await audit.transferOwnership(await emergency.getAddress())).wait();

  console.log(JSON.stringify({
    registry: await registry.getAddress(),
    access: await access.getAddress(),
    records: await records.getAddress(),
    audit: await audit.getAddress(),
    emergency: await emergency.getAddress(),
    deployer: deployer.address,
    relayer: relayAddress,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { main, resolveRelayAddress };
