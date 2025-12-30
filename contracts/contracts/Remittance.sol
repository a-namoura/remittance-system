// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Remittance {
    event Transfer(
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        uint256 timestamp
    );

    error InvalidReceiver();
    error ZeroAmount();

    function transfer(address payable receiver) external payable {
        if (receiver == address(0)) revert InvalidReceiver();
        if (msg.value == 0) revert ZeroAmount();

        (bool ok, ) = receiver.call{value: msg.value}("");
        require(ok, "TRANSFER_FAILED");

        emit Transfer(msg.sender, receiver, msg.value, block.timestamp);
    }
}
