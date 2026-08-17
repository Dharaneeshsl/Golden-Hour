// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AuditLog
/// @notice Immutable append-only audit trail for normal and emergency access.
contract AuditLog is Ownable {
    struct Entry { uint256 patientId; address accessor; string reason; string scope; uint64 timestamp; }
    mapping(uint256 => Entry[]) private _entries;
    event AccessLogged(uint256 indexed patientId, address indexed accessor, string scope, string reason);
    constructor(address initialOwner) Ownable(initialOwner) {}
    function logAccess(uint256 patientId, address accessor, string calldata reason, string calldata scope) external onlyOwner {
        _entries[patientId].push(Entry(patientId, accessor, reason, scope, uint64(block.timestamp)));
        emit AccessLogged(patientId, accessor, scope, reason);
    }
    function getAuditTrail(uint256 patientId) external view returns (Entry[] memory) { return _entries[patientId]; }
    function entryCount(uint256 patientId) external view returns (uint256) { return _entries[patientId].length; }
}
