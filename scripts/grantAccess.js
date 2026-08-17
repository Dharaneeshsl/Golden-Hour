const hre = require("hardhat");
async function main() {
  const [patient] = await hre.ethers.getSigners();
  const patientId = process.env.PATIENT_ID || "1";
  const provider = process.env.PROVIDER_ADDRESS;
  if (!provider) throw new Error("Set PROVIDER_ADDRESS before granting access");
  const access = await hre.ethers.getContractAt("contracts/AccessControl.sol:AccessControl", process.env.ACCESS_CONTROL_ADDRESS);
  const expiry = process.env.ACCESS_EXPIRY || "0";
  await (await access.connect(patient).grantAccess(patientId, provider, expiry)).wait();
  console.log(`Access granted for patient ${patientId} to ${provider}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
