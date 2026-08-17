const hre = require("hardhat");
async function main() {
  const [owner] = await hre.ethers.getSigners();
  const registry = await hre.ethers.getContractAt("PatientRegistry", process.env.REGISTRY_ADDRESS);
  const access = await hre.ethers.getContractAt("contracts/AccessControl.sol:AccessControl", process.env.ACCESS_CONTROL_ADDRESS);
  const records = await hre.ethers.getContractAt("MedicalRecord", process.env.RECORDS_ADDRESS);
  await (await registry.registerPatient(hre.ethers.id("demo-profile"), hre.ethers.id("demo-critical"))).wait();
  await (await access.setProviderVerified(owner.address, true)).wait();
  await (await access.grantAccess(1, owner.address, 0)).wait();
  await (await records.addRecord(1, "allergy", "ipfs://demo", hre.ethers.id("encrypted-demo"))).wait();
  console.log("Seed data created for patient 1");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
