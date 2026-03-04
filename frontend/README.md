# Frontend

React + Vite client for the remittance system.

## Stack

- React 19
- React Router
- Tailwind CSS
- ethers.js (wallet and chain interactions)

## Prerequisites

- Node.js 20+
- npm 10+
- Running backend API (default: `http://localhost:5000`)

## Setup

```bash
cd frontend
npm ci
```

Create `.env` from `.env.example`, then start dev server:

```bash
npm run dev
```

App runs on `http://localhost:5173` by default.

## Environment Variables

Variables currently used by the frontend source:

- `VITE_API_BASE_URL`: optional primary API base URL
- `VITE_API_URL`: fallback API base URL (defaults to `http://localhost:5000`)
- `VITE_API_TIMEOUT_MS`: request timeout in milliseconds (default `15000`)
- `VITE_EXPLORER_BASE_URL`: explorer base URL for tx links (example: `https://testnet.bscscan.com`)
- `VITE_COUNTRIES_API`: optional countries endpoint used in registration flow
- `VITE_FLAG_BASE_URL`: optional flag image base URL for registration UI
- `VITE_REGISTER_CODE_TTL_SECONDS`: local registration-code TTL display (default `30`)

Note: variables such as `VITE_REM_CONTRACT_ADDRESS` in `.env.example` are not currently referenced by `src/`.

## Available Scripts

Run development server:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
```

Preview production bundle locally:

```bash
npm run preview
```

Run ESLint:

```bash
npm run lint
```

## App Routing Overview

Public pages include:

- `/`
- `/login`
- `/register`
- `/forgot-password`
- `/claim-transfer`

Authenticated pages include dashboard, account, friends, send/request money, chat, and transactions.
Admin pages include `/admin` and `/admin/audit-logs`.
