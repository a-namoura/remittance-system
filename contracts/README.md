# Remittance Contracts

Smart contracts and Hardhat scripts for remittance settlement on EVM-compatible blockchains (deployment target: BNB Smart Chain Testnet).

## What Is Here

- `contracts/Remittance.sol`: production remittance contract used by backend/frontend flows
- `scripts/deploy-remittance.ts`: deploys `Remittance`
- `scripts/call-transfer.ts`: executes `Remittance.transfer(...)` for smoke testing
- `test/Remittance.ts`: contract behavior tests
- `RELEASE_CHECKLIST.md`: pre-release review and deployment evidence checklist

## Prerequisites

- Node.js 22.x (the supported project runtime)
- npm 10+

## Install

```bash
cd contracts
npm ci
```

## Network Configuration

`hardhat.config.ts` expects these configuration variables for `bscTestnet`:

- `BSC_TESTNET_RPC_URL`
- `BSC_TESTNET_PRIVATE_KEY`

Set them with Hardhat keystore (recommended):

```bash
npx hardhat keystore set BSC_TESTNET_RPC_URL
npx hardhat keystore set BSC_TESTNET_PRIVATE_KEY
```

Or provide them as environment variables in your shell.

## Contract Flows

- `transfer(receiver)` sends BNB immediately and retains the original API.
- `createEscrow(receiver, expiresAt)` creates a numbered, time-limited escrow.
- `claim(transactionId)` credits the receiver before expiry.
- `cancel(transactionId)` credits the sender once the escrow expires.
- `withdraw()` safely withdraws all credits using the pull-payment pattern.
- The owner can pause new transfers and escrows and transfer ownership. Existing
  escrow claims, cancellations, and withdrawals remain available while paused.

## Common Commands

Compile:

```bash
npx hardhat compile
```

Run tests:

```bash
npx hardhat test
```

Deploy to BNB Smart Chain Testnet:

```bash
npx hardhat run scripts/deploy-remittance.ts --network bscTestnet
```

## Transfer Smoke Test Script

`scripts/call-transfer.ts` reads from `contracts/.env`:

- `REM_CONTRACT_ADDRESS`
- `REM_TEST_RECEIVER`

Run:

```bash
npx hardhat run scripts/call-transfer.ts --network bscTestnet
```

## OP Simulation Script

Run OP chain-type simulation transaction:

```bash
npx hardhat run scripts/send-op-tx.ts
```

## Syncing Artifacts With App

After each deployment, update shared files used by the backend:

- `../blockchain/Remittance.abi.json`
- `../blockchain/deployment.json`

The backend loads `Remittance.abi.json` at runtime for contract calls.

## Release Review

Before deploying or releasing updated contract artifacts, complete
`RELEASE_CHECKLIST.md` and keep the reviewed source, configuration, ABI, and
deployment metadata versioned together.
