# SRS system-requirements evidence

Source: `SRS/Abdallah Namoura SRS 2.0.pdf`, section 5.1.4. The machine-readable record is [srs-system-requirements-evidence.json](srs-system-requirements-evidence.json). Each requirement is evaluated separately: missing or failing listed tests make that requirement **fail**.

| Requirement | Area | Status | Automated evidence |
| --- | --- | --- | --- |
| SR-1 | Protected authentication | pass | Real JWT verification against an active persisted session; authenticated transfer-route check |
| SR-2 | EVM/BSC smart-contract transfers | pass | Payable contract transfer invocation, wei conversion, transaction hash, and confirmation result; pending submission persistence |
| SR-3 | MongoDB persistence | pass | Mongoose models and required fields for users, wallets, transactions, and audit logs; final blockchain-result synchronization |
| SR-4 | Modern browser and wallet integration | pass | Playwright browser tests for an injected MetaMask-compatible provider, missing provider, and rejected connection |
