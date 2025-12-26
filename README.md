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
- Create a `.env` file inside `backend/` based on `.env.example`:
- ```env
- PORT=5000
- MONGODB_URI=your_mongodb_connection_string
- JWT_SECRET=dev_secret_change_later
- NODE_ENV=development