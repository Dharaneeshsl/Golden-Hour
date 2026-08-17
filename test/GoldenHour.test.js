const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoldenHour contracts", function () {
  async function deploy() {
    const [owner, patient, doctor, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("PatientRegistry"); const registry = await Registry.deploy(owner.address);
    const Access = await ethers.getContractFactory("contracts/AccessControl.sol:AccessControl"); const access = await Access.deploy(owner.address, await registry.getAddress());
    const Records = await ethers.getContractFactory("MedicalRecord"); const records = await Records.deploy(await access.getAddress());
    const Audit = await ethers.getContractFactory("AuditLog"); const audit = await Audit.deploy(owner.address);
    const Emergency = await ethers.getContractFactory("EmergencyAccess"); const emergency = await Emergency.deploy(await registry.getAddress(), await access.getAddress(), await audit.getAddress());
    await audit.transferOwnership(await emergency.getAddress());
    await access.grantRole(await access.VERIFIER_ROLE(), owner.address);
    await access.grantRole(await access.VERIFIER_ROLE(), doctor.address);
    await access.connect(doctor).setProviderVerified(doctor.address, true);
    return { owner, patient, doctor, stranger, registry, access, records, audit, emergency };
  }
  it("registers unique patients and stores only hashes", async function () {
    const { registry, patient } = await deploy();
    await expect(registry.connect(patient).registerPatient(ethers.id("profile"), ethers.id("critical"))).to.emit(registry, "PatientRegistered");
    expect(await registry.getPatientId(patient.address)).to.equal(1);
    await expect(registry.connect(patient).registerPatient(ethers.id("x"), ethers.id("y"))).to.be.revertedWith("Already registered");
  });
  it("supports verified, time-bound access and append-only records", async function () {
    const { registry, access, records, patient, doctor } = await deploy();
    await registry.connect(patient).registerPatient(ethers.id("profile"), ethers.id("critical"));
    await expect(records.connect(doctor).addRecord(1, "allergy", "ipfs://demo", ethers.id("encrypted"))).to.be.revertedWith("No patient access");
    await access.connect(patient).grantAccess(1, doctor.address, 0);
    await records.connect(doctor).addRecord(1, "allergy", "ipfs://demo", ethers.id("encrypted"));
    expect(await records.recordCount(1)).to.equal(1);
  });
  it("logs justified emergency access", async function () {
    const { registry, access, audit, emergency, patient, doctor } = await deploy();
    await registry.connect(patient).registerPatient(ethers.id("profile"), ethers.id("critical"));
    await access.connect(doctor).setProviderVerified(doctor.address, true);
    await expect(emergency.connect(doctor).triggerEmergencyAccess(1, "Unconscious trauma patient"))
      .to.emit(emergency, "EmergencyTriggered");
    expect(await audit.entryCount(1)).to.equal(1);
  });
});
