// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IRegistry { function ownerOfPatient(uint256 patientId) external view returns (address); }
interface IProviderAccess { function verifiedProvider(address provider) external view returns (bool); }
interface IAudit { function logAccess(uint256 patientId, address accessor, string calldata reason, string calldata scope) external; }

/// @title EmergencyAccess
/// @notice Break-glass access is restricted to verified providers and logged on-chain.
contract EmergencyAccess is Ownable {
    IRegistry public immutable registry;
    IProviderAccess public immutable accessControl;
    IAudit public immutable auditLog;

    event EmergencyTriggered(uint256 indexed patientId, address indexed doctor, bytes32 indexed justificationHash);

    constructor(address registryAddress, address accessAddress, address auditAddress, address initialOwner) Ownable(initialOwner) {
        registry = IRegistry(registryAddress);
        accessControl = IProviderAccess(accessAddress);
        auditLog = IAudit(auditAddress);
    }

    function triggerEmergencyAccess(uint256 patientId, string calldata justification) external {
        _trigger(patientId, msg.sender, justification);
    }

    function triggerEmergencyAccessFor(uint256 patientId, address doctor, string calldata justification) external onlyOwner {
        _trigger(patientId, doctor, justification);
    }

    function _trigger(uint256 patientId, address doctor, string calldata justification) internal {
        require(accessControl.verifiedProvider(doctor), "Provider not verified");
        require(bytes(justification).length >= 10, "Justification required");
        require(registry.ownerOfPatient(patientId) != address(0), "Patient not found");

        bytes32 justificationHash = keccak256(bytes(justification));
        auditLog.logAccess(patientId, doctor, "EMERGENCY_BREAK_GLASS_HASHED", "EMERGENCY_CRITICAL_ONLY");
        emit EmergencyTriggered(patientId, doctor, justificationHash);
    }
}
