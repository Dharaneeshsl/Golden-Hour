// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PatientRegistry
/// @notice Maps a wallet to a pseudonymous patient identity and encrypted-data hashes.
contract PatientRegistry is Ownable {
    struct Patient {
        uint256 id;
        bytes32 basicInfoHash;
        bytes32 criticalInfoHash;
        uint64 registeredAt;
        bool active;
    }

    uint256 private _nextPatientId = 1;
    mapping(address => Patient) private _patients;
    mapping(uint256 => address) private _patientOwner;

    event PatientRegistered(uint256 indexed patientId, address indexed patient, bytes32 basicInfoHash);
    event PatientHashesUpdated(uint256 indexed patientId, bytes32 basicInfoHash, bytes32 criticalInfoHash);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerPatient(bytes32 basicInfoHash, bytes32 criticalInfoHash) external returns (uint256 patientId) {
        require(_patients[msg.sender].id == 0, "Already registered");
        patientId = _nextPatientId++;
        _patients[msg.sender] = Patient(patientId, basicInfoHash, criticalInfoHash, uint64(block.timestamp), true);
        _patientOwner[patientId] = msg.sender;
        emit PatientRegistered(patientId, msg.sender, basicInfoHash);
    }

    function updateHashes(bytes32 basicInfoHash, bytes32 criticalInfoHash) external {
        Patient storage patient = _patients[msg.sender];
        require(patient.id != 0 && patient.active, "Patient not found");
        patient.basicInfoHash = basicInfoHash;
        patient.criticalInfoHash = criticalInfoHash;
        emit PatientHashesUpdated(patient.id, basicInfoHash, criticalInfoHash);
    }

    function getPatientId(address wallet) external view returns (uint256) { return _patients[wallet].id; }
    function getPatient(uint256 patientId) external view returns (Patient memory) {
        address wallet = _patientOwner[patientId];
        require(wallet != address(0), "Patient not found");
        return _patients[wallet];
    }
    function ownerOfPatient(uint256 patientId) external view returns (address) { return _patientOwner[patientId]; }
}
