// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl as OZAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IPatientRegistryOwner { function ownerOfPatient(uint256 patientId) external view returns (address); }

/// @title AccessControl
/// @notice Patient-controlled, time-bound permissions for verified providers.
contract AccessControl is OZAccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    mapping(uint256 => mapping(address => uint256)) private _expiry;
    mapping(address => bool) public verifiedProvider;
    IPatientRegistryOwner public immutable patientRegistry;

    event ProviderVerified(address indexed provider, bool verified);
    event AccessGranted(uint256 indexed patientId, address indexed provider, uint256 expiry);
    event AccessRevoked(uint256 indexed patientId, address indexed provider);

    constructor(address admin, address registryAddress) { _grantRole(DEFAULT_ADMIN_ROLE, admin); patientRegistry = IPatientRegistryOwner(registryAddress); }

    function setProviderVerified(address provider, bool verified) external onlyRole(VERIFIER_ROLE) {
        verifiedProvider[provider] = verified;
        emit ProviderVerified(provider, verified);
    }

    function grantAccess(uint256 patientId, address provider, uint256 expiry) external {
        require(patientRegistry.ownerOfPatient(patientId) == msg.sender, "Not patient owner");
        require(verifiedProvider[provider], "Provider not verified");
        require(expiry == 0 || expiry > block.timestamp, "Invalid expiry");
        _expiry[patientId][provider] = expiry == 0 ? type(uint256).max : expiry;
        emit AccessGranted(patientId, provider, _expiry[patientId][provider]);
    }

    function revokeAccess(uint256 patientId, address provider) external {
        require(patientRegistry.ownerOfPatient(patientId) == msg.sender, "Not patient owner");
        _expiry[patientId][provider] = 0;
        emit AccessRevoked(patientId, provider);
    }

    function checkAccess(uint256 patientId, address provider) public view returns (bool) {
        return _expiry[patientId][provider] >= block.timestamp && _expiry[patientId][provider] != 0;
    }
    function accessExpiry(uint256 patientId, address provider) external view returns (uint256) { return _expiry[patientId][provider]; }
}
