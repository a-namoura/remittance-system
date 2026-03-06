# Remittance Contracts

Smart contracts and Hardhat scripts for remittance settlement on EVM networks (primary target: BSC Testnet).

## What Is Here

- `contracts/Remittance.sol`: production remittance contract used by backend/frontend flows
- `scripts/deploy-remittance.ts`: deploys `Remittance`
- `scripts/call-transfer.ts`: executes `Remittance.transfer(...)` for smoke testing
- `test/Remittance.ts`: contract behavior tests

## Prerequisites

- Node.js 20+
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

## Common Commands

Compile:

```bash
npx hardhat compile
```

Run tests:

```bash
npx hardhat test
```

Deploy to BSC Testnet:

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
