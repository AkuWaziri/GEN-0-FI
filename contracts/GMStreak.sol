// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GEN-0FI GM Streak
 * @notice One GM check-in per wallet per UTC day on Arc Mainnet.
 *
 * Arc uses native USDC with 18 decimals. Each successful GM requires
 * exactly 0.01 USDC in msg.value. The contract forwards that amount
 * immediately to the immutable fee recipient.
 */
contract GMStreak {
    uint256 public constant GM_FEE = 0.01 ether;

    address public immutable feeRecipient;

    mapping(address => uint256) public lastCheckInDay;

    event GMCheckedIn(
        address indexed wallet,
        uint256 indexed day,
        uint256 timestamp,
        uint256 fee
    );

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "invalid fee recipient");
        feeRecipient = _feeRecipient;
    }

    function checkIn() external payable {
        require(msg.value == GM_FEE, "GM fee must be 0.01 USDC");

        uint256 day = block.timestamp / 1 days;
        require(lastCheckInDay[msg.sender] != day, "already checked in today");

        lastCheckInDay[msg.sender] = day;

        (bool sent, ) = feeRecipient.call{value: msg.value}("");
        require(sent, "fee transfer failed");

        emit GMCheckedIn(msg.sender, day, block.timestamp, msg.value);
    }

    receive() external payable {
        revert("use checkIn");
    }

    fallback() external payable {
        revert("use checkIn");
    }
}
