// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRegistry { function ownerOfPatient(uint256 patientId) external view returns (address); }
interface IProviderAccess { function verifiedProvider(address provider) external view returns (bool); }
interface IAudit { function logAccess(uint256 patientId, address accessor, string calldata reason, string calldata scope) external; }

/// @title EmergencyAccess
/// @notice Break-glass access is restricted to verified providers and logged on-chain.
contract EmergencyAccess {
    IRegistry public immutable registry;
    IProviderAccess public immutable accessControl;
    IAudit public immutable auditLog;
    event EmergencyTriggered(uint256 indexed patientId, address indexed doctor, string justification);

    constructor(address registryAddress, address accessAddress, address auditAddress) {
        registry = IRegistry(registryAddress); accessControl = IProviderAccess(accessAddress); auditLog = IAudit(auditAddress);
    }
    function triggerEmergencyAccess(uint256 patientId, string calldata justification) external {
        require(accessControl.verifiedProvider(msg.sender), "Provider not verified");
        require(bytes(justification).length >= 10, "Justification required");
        require(registry.ownerOfPatient(patientId) != address(0), "Patient not found");
        auditLog.logAccess(patientId, msg.sender, justification, "EMERGENCY_CRITICAL_ONLY");
        emit EmergencyTriggered(patientId, msg.sender, justification);
    }
}
