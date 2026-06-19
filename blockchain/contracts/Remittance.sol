// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Remittance
/// @notice Transfers native currency to a receiver and emits public transfer metadata.
/// @dev This contract does not store passwords, email addresses, personal profile
/// information, session tokens, password-reset tokens, or other off-chain account data.
contract Remittance {
    error InvalidReceiver();
    error SelfTransfer();
    error ZeroAmount();

    event Transfer(
        address indexed sender,
        address indexed receiver,
        uint256 amount,
        uint256 timestamp
    );

    function transfer(address payable receiver) external payable {
        if (receiver == address(0)) revert InvalidReceiver();
        if (receiver == msg.sender) revert SelfTransfer();
        if (msg.value == 0) revert ZeroAmount();

        receiver.transfer(msg.value);

        emit Transfer(msg.sender, receiver, msg.value, block.timestamp);
    }
}
