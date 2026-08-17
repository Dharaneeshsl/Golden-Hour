const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const Registry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await Registry.deploy(deployer.address); await registry.waitForDeployment();
  const Access = await hre.ethers.getContractFactory("contracts/AccessControl.sol:AccessControl");
  const access = await Access.deploy(deployer.address, await registry.getAddress()); await access.waitForDeployment();
  const Records = await hre.ethers.getContractFactory("MedicalRecord");
  const records = await Records.deploy(await access.getAddress()); await records.waitForDeployment();
  const Audit = await hre.ethers.getContractFactory("AuditLog");
  const audit = await Audit.deploy(deployer.address); await audit.waitForDeployment();
  const Emergency = await hre.ethers.getContractFactory("EmergencyAccess");
  const emergency = await Emergency.deploy(await registry.getAddress(), await access.getAddress(), await audit.getAddress()); await emergency.waitForDeployment();
  await access.grantRole(await access.VERIFIER_ROLE(), deployer.address);
  await audit.transferOwnership(await emergency.getAddress());
  console.log(JSON.stringify({ registry: await registry.getAddress(), access: await access.getAddress(), records: await records.getAddress(), audit: await audit.getAddress(), emergency: await emergency.getAddress() }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
