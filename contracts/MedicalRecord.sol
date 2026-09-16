// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMedicalRecord} from "./interfaces/IMedicalRecord.sol";

interface IGoldenHourAccess {
    function checkAccess(uint256 patientId, address provider) external view returns (bool);
}

/// @title MedicalRecord
/// @notice Append-only record hashes; encrypted clinical data remains off-chain.
contract MedicalRecord is Ownable, IMedicalRecord {
    struct Record {
        uint256 version;
        string recordType;
        string ipfsHash;
        bytes32 encryptedHash;
        address doctor;
        uint64 createdAt;
    }

    IGoldenHourAccess public immutable accessControl;
    mapping(uint256 => Record[]) private _records;

    event RecordAdded(
        uint256 indexed patientId,
        uint256 indexed version,
        string recordType,
        address indexed doctor
    );

    constructor(address accessControlAddress, address initialOwner) Ownable(initialOwner) {
        accessControl = IGoldenHourAccess(accessControlAddress);
    }

    function addRecord(
        uint256 patientId,
        string calldata recordType,
        string calldata ipfsHash,
        bytes32 encryptedHash
    ) external {
        require(accessControl.checkAccess(patientId, msg.sender), "No patient access");
        _add(patientId, recordType, ipfsHash, encryptedHash, msg.sender);
    }

    function addRecordFor(
        uint256 patientId,
        address doctor,
        string calldata recordType,
        string calldata ipfsHash,
        bytes32 encryptedHash
    ) external onlyOwner {
        require(accessControl.checkAccess(patientId, doctor), "No patient access");
        _add(patientId, recordType, ipfsHash, encryptedHash, doctor);
    }

    function _add(
        uint256 patientId,
        string calldata recordType,
        string calldata ipfsHash,
        bytes32 encryptedHash,
        address doctor
    ) internal {
        uint256 version = _records[patientId].length + 1;
        _records[patientId].push(
            Record(version, recordType, ipfsHash, encryptedHash, doctor, uint64(block.timestamp))
        );
        emit RecordAdded(patientId, version, recordType, doctor);
    }

    function getRecords(uint256 patientId) external view returns (Record[] memory) {
        require(accessControl.checkAccess(patientId, msg.sender), "No patient access");
        return _records[patientId];
    }

    function recordCount(uint256 patientId) external view override returns (uint256) {
        return _records[patientId].length;
    }
}
