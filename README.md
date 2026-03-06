# Remittance System

A full-stack remittance application with:

- React frontend (`frontend/`)
- Express + MongoDB backend (`backend/`)
- Hardhat smart contracts (`contracts/`)
- Shared blockchain artifacts (`blockchain/`)

The system supports account onboarding, wallet linking, transfer links, direct sends, transaction tracking, friends/chat flows, and admin monitoring.

## Tech Stack

- Frontend: React 19, Vite, Tailwind CSS
- Backend: Node.js, Express, Mongoose
- Blockchain: Solidity + Hardhat 3 + ethers
- Network target: BSC Testnet (chain ID `97`)
- Wallet: MetaMask-compatible EVM wallet

## Repository Layout

```text
remittance-system/
|- backend/       # API + MongoDB integration + blockchain bridge
|- frontend/      # Web app
|- contracts/     # Solidity contracts + Hardhat scripts/tests
|- blockchain/    # Shared ABI + deployment metadata used by backend
|- docker-compose.yml
`- README.md
```

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB instance (local or hosted)
- MetaMask (or compatible wallet) for wallet-linked flows

## Quick Start (Local Development)

1. Configure backend environment:
   - Create `backend/.env`
   - You can start from root `.env.example`
   - Add blockchain/email settings shown below if you want full transfer and verification functionality
2. Install backend dependencies and run backend:

   ```bash
   cd backend
   npm ci
   npm run dev
   ```

3. Configure frontend environment:
   - Create `frontend/.env` from `frontend/.env.example`
4. Install frontend dependencies and run frontend:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

5. Open:
   - Frontend: `http://localhost:5173`
   - Backend health: `http://localhost:5000/api/health`

## Backend Environment Variables

Minimum required to boot API and auth:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/remittance
JWT_SECRET=replace-with-a-strong-secret
NODE_ENV=development
```

Required for on-chain transfer flows (`/api/transactions/send`, claim, balance):

```env
BSC_TESTNET_RPC_URL=https://your-bsc-testnet-rpc
BSC_TESTNET_PRIVATE_KEY=your-private-key
REM_CONTRACT_ADDRESS=0xYourRemittanceContractAddress
```

Optional currency/email settings used by specific features:

```env
REM_NATIVE_CURRENCY=ETH
REM_RATE_USD_PER_ETH=3000
REM_RATE_USD_PER_BTC=90000
SENDGRID_API_KEY=...
SENDGRID_FROM=no-reply@example.com
# or EMAIL_FROM as fallback sender
```

## Run With Docker Compose

`docker-compose.yml` starts frontend + backend containers.

1. Ensure `backend/.env` exists and points to a reachable MongoDB instance.
2. Start stack:

   ```bash
   docker compose up --build
   ```

3. Access app at `http://localhost:5173`.

## Smart Contract Deployment

From `contracts/`:

```bash
npm ci
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy-remittance.ts --network bscTestnet
```

After deployment, update shared artifacts in `blockchain/`:

- `blockchain/Remittance.abi.json`
- `blockchain/deployment.json`

The backend reads the ABI from `blockchain/Remittance.abi.json`.

## Related Docs

- `frontend/README.md`
- `contracts/README.md`
