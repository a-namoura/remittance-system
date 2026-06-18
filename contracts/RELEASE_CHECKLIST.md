# Smart Contract Release Checklist

Use this checklist before deploying or updating the `Remittance` contract artifacts used by the application.

## Contract Scope

- Contract source: `contracts/contracts/Remittance.sol`
- Hardhat configuration: `contracts/hardhat.config.ts`
- Deployment script: `contracts/scripts/deploy-remittance.ts`
- Contract tests: `contracts/test/Remittance.ts`
- Shared ABI: `blockchain/Remittance.abi.json`
- Shared deployment metadata: `blockchain/deployment.json`

## Pre-Release Review

- [ ] Contract source was reviewed for expected transfer behavior.
- [ ] Contract source was reviewed to confirm it does not store passwords, email addresses, personal profile information, session tokens, password-reset tokens, or other off-chain account data.
- [ ] Hardhat network configuration was reviewed before deployment.
- [ ] Deployment script was reviewed before deployment.
- [ ] Shared ABI and deployment metadata were reviewed before application release.
- [ ] Reviewer name:
- [ ] Review date:
- [ ] Related commit or pull request:

## Required Verification

Run from `contracts/` before deployment:

```bash
npm ci
npx hardhat compile
npx hardhat test
```

Expected `Remittance` test coverage:

- Successful transfer emits `Transfer`.
- Successful transfer increases receiver balance.
- Zero-value transfer reverts with `ZeroAmount`.
- Zero-address receiver reverts with `InvalidReceiver`.

## Deployment Record

Current shared deployment metadata:

- Network: BSC Testnet
- Chain ID: `97`
- Contract address: `0xDE73104E421AfEa1A4c92d4D7fc5fFdC8d8e3BDa`
- Explorer: `https://testnet.bscscan.com`
- Verification transaction/reference: `0xde472c739ffc1443ea49e58fd8fb6e5e44bdb2c11fc9b6ca45bbca46fd39d16e`

After each deployment:

- [ ] Update `blockchain/Remittance.abi.json`.
- [ ] Update `blockchain/deployment.json`.
- [ ] Run backend/frontend smoke checks against the new contract address.
