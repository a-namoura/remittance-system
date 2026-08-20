// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Remittance {
    enum Status { None, Pending, Claimed, Cancelled }
    struct Transaction { address sender; address receiver; uint256 amount; uint64 expiresAt; Status status; }

    event Transfer(address indexed sender, address indexed receiver, uint256 amount, uint256 timestamp);
    event EscrowCreated(uint256 indexed transactionId, address indexed sender, address indexed receiver, uint256 amount, uint64 expiresAt);
    event EscrowClaimed(uint256 indexed transactionId, address indexed receiver, uint256 amount);
    event EscrowCancelled(uint256 indexed transactionId, address indexed sender, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error InvalidReceiver(); error SelfTransfer(); error ZeroAmount(); error InvalidExpiry();
    error TransactionNotPending(); error NotReceiver(); error NotSender(); error TransactionExpired();
    error TransactionNotExpired(); error NoFundsToWithdraw(); error TransferFailed(); error Unauthorized();
    error InvalidOwner(); error ContractPaused(); error ContractNotPaused(); error ReentrantCall();

    address public owner;
    bool public paused;
    uint256 public nextTransactionId = 1;
    mapping(uint256 => Transaction) public transactions;
    mapping(address => uint256) public withdrawableBalances;
    uint256 private _locked = 1;

    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier whenNotPaused() { if (paused) revert ContractPaused(); _; }
    modifier nonReentrant() { if (_locked != 1) revert ReentrantCall(); _locked = 2; _; _locked = 1; }

    constructor() { owner = msg.sender; emit OwnershipTransferred(address(0), msg.sender); }

    /// @notice Sends the native asset immediately, preserving the original API.
    function transfer(address payable receiver) external payable whenNotPaused nonReentrant {
        _validateTransfer(receiver, msg.value);
        _sendValue(receiver, msg.value);
        emit Transfer(msg.sender, receiver, msg.value, block.timestamp);
    }

    /// @notice Escrows funds until claimed or cancelled after the Unix expiry timestamp.
    function createEscrow(address receiver, uint64 expiresAt) external payable whenNotPaused returns (uint256 transactionId) {
        _validateTransfer(receiver, msg.value);
        if (expiresAt <= block.timestamp) revert InvalidExpiry();
        transactionId = nextTransactionId++;
        transactions[transactionId] = Transaction(msg.sender, receiver, msg.value, expiresAt, Status.Pending);
        emit EscrowCreated(transactionId, msg.sender, receiver, msg.value, expiresAt);
    }

    /// @notice Finalizes an escrow and credits its receiver for withdrawal.
    function claim(uint256 transactionId) external {
        Transaction storage transaction = _pendingTransaction(transactionId);
        if (msg.sender != transaction.receiver) revert NotReceiver();
        if (block.timestamp >= transaction.expiresAt) revert TransactionExpired();
        transaction.status = Status.Claimed;
        withdrawableBalances[msg.sender] += transaction.amount;
        emit EscrowClaimed(transactionId, msg.sender, transaction.amount);
    }

    /// @notice Credits the sender with a refund once an escrow expires.
    function cancel(uint256 transactionId) external {
        Transaction storage transaction = _pendingTransaction(transactionId);
        if (msg.sender != transaction.sender) revert NotSender();
        if (block.timestamp < transaction.expiresAt) revert TransactionNotExpired();
        transaction.status = Status.Cancelled;
        withdrawableBalances[msg.sender] += transaction.amount;
        emit EscrowCancelled(transactionId, msg.sender, transaction.amount);
    }

    /// @notice Withdraws all finalized escrow funds using checks-effects-interactions.
    function withdraw() external nonReentrant {
        uint256 amount = withdrawableBalances[msg.sender];
        if (amount == 0) revert NoFundsToWithdraw();
        withdrawableBalances[msg.sender] = 0;
        _sendValue(payable(msg.sender), amount);
        emit Withdrawal(msg.sender, amount);
    }

    function pause() external onlyOwner { if (paused) revert ContractPaused(); paused = true; emit Paused(msg.sender); }
    function unpause() external onlyOwner { if (!paused) revert ContractNotPaused(); paused = false; emit Unpaused(msg.sender); }
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        address previousOwner = owner; owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function _pendingTransaction(uint256 transactionId) private view returns (Transaction storage transaction) {
        transaction = transactions[transactionId];
        if (transaction.status != Status.Pending) revert TransactionNotPending();
    }
    function _validateTransfer(address receiver, uint256 amount) private view {
        if (receiver == address(0)) revert InvalidReceiver();
        if (receiver == msg.sender) revert SelfTransfer();
        if (amount == 0) revert ZeroAmount();
    }
    function _sendValue(address payable receiver, uint256 amount) private {
        (bool ok, ) = receiver.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
