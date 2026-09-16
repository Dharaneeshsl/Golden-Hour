// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PatientRegistry
/// @notice Maps a wallet to a pseudonymous patient identity and encrypted-data hashes.
contract PatientRegistry is Ownable {
    struct Patient { uint256 id; bytes32 basicInfoHash; bytes32 criticalInfoHash; uint64 registeredAt; bool active; }
    uint256 private _nextPatientId = 1;
    mapping(address => Patient) private _patients;
    mapping(uint256 => address) private _patientOwner;
    event PatientRegistered(uint256 indexed patientId, address indexed patient, bytes32 basicInfoHash);
    event PatientHashesUpdated(uint256 indexed patientId, bytes32 basicInfoHash, bytes32 criticalInfoHash);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerPatient(bytes32 basicInfoHash, bytes32 criticalInfoHash) external returns (uint256 patientId) {
        return _register(msg.sender, basicInfoHash, criticalInfoHash);
    }

    function registerPatientFor(address patient, bytes32 basicInfoHash, bytes32 criticalInfoHash) external onlyOwner returns (uint256 patientId) {
        return _register(patient, basicInfoHash, criticalInfoHash);
    }

    function _register(address patient, bytes32 basicInfoHash, bytes32 criticalInfoHash) internal returns (uint256 patientId) {
        require(patient != address(0), "Invalid patient");
        require(_patients[patient].id == 0, "Already registered");
        patientId = _nextPatientId++;
        _patients[patient] = Patient(patientId, basicInfoHash, criticalInfoHash, uint64(block.timestamp), true);
        _patientOwner[patientId] = patient;
        emit PatientRegistered(patientId, patient, basicInfoHash);
    }

    function updateHashes(bytes32 basicInfoHash, bytes32 criticalInfoHash) external {
        _updateHashes(msg.sender, basicInfoHash, criticalInfoHash);
    }

    function updateHashesFor(address patient, bytes32 basicInfoHash, bytes32 criticalInfoHash) external onlyOwner {
        _updateHashes(patient, basicInfoHash, criticalInfoHash);
    }

    function _updateHashes(address patientWallet, bytes32 basicInfoHash, bytes32 criticalInfoHash) internal {
        Patient storage patient = _patients[patientWallet];
        require(patient.id != 0 && patient.active, "Patient not found");
        patient.basicInfoHash = basicInfoHash;
        patient.criticalInfoHash = criticalInfoHash;
        emit PatientHashesUpdated(patient.id, basicInfoHash, criticalInfoHash);
    }

    function getPatientId(address wallet) external view returns (uint256) { return _patients[wallet].id; }
    function getPatient(uint256 patientId) external view returns (Patient memory) { address wallet = _patientOwner[patientId]; require(wallet != address(0), "Patient not found"); return _patients[wallet]; }
    function ownerOfPatient(uint256 patientId) external view returns (address) { return _patientOwner[patientId]; }
}
