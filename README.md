# remittance-system
A blockchain-based remittance system implementing Ethereum smart contracts to enable secure and transparent cross-border money transfers.

## Tech Stack
- Frontend: React.js, Tailwind CSS
- Backend: Node.js, Express.js
- Database: MongoDB
- Blockchain: Ethereum (Smart Contracts, Testnet)
- Wallet Integration: MetaMask

## Repo Structure
- remittance-system/
- - frontend/ # React + Tailwind frontend
- - backend/ # Node.js + Express API
- - .env.example
- - README.md

## Project Status
Phase 1 – Project Setup & Architecture

## Environment Setup
- Create a `.env` file inside `backend/` based on `.env.example`

# Blockchain Deployment (Testnet)

## Network
- Network: BSC Testnet
- Chain ID: 97
- Explorer: https://testnet.bscscan.com

## Remittance Contract
- Address: see `deployment.json`
- ABI: `Remittance.abi.json`

## Deploy (from /contracts)
```bash
npx hardhat run scripts/deploy-remittance.ts --network bscTestnet
