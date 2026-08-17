// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMedicalRecord {
    function recordCount(uint256 patientId) external view returns (uint256);
}
