# SRS user-requirements evidence

Source: `SRS/Abdallah Namoura SRS 2.0.pdf`, section 5.1.3. The machine-readable record is [srs-user-requirements-evidence.json](srs-user-requirements-evidence.json). Each requirement is evaluated separately: missing or failing listed tests make that requirement **fail**.

| Requirement | Area | Status | Automated evidence |
| --- | --- | --- | --- |
| UR-1.1 | Account registration | pass | Password policy unit test; registration conflict notification E2E |
| UR-1.2 | Account login | pass | Login success notification E2E |
| UR-1.3 | Password recovery | pass | Password reset success E2E |
| UR-2.1 | Wallet connection | pass | Wallet connection success E2E |
| UR-2.2 | Wallet disconnection | pass | Wallet unlink E2E |
| UR-2.3 | Wallet notifications | pass | Wallet connection failure E2E |
| UR-2.4 | Signed wallet ownership | pass | Wallet connection E2E (challenge, signature, link flow) |
| UR-2.5 | Wallet status | pass | Wallet unlink E2E |
| UR-3.1 | Send to address or registered user | pass | Authenticated API send test; valid-address transfer E2E |
| UR-3.2 | Transaction summary | pass | Transfer summary E2E |
| UR-3.3 | Confirm/cancel transfer | pass | Transfer cancellation E2E |
| UR-3.4 | Transaction statuses | pass | Terminal success and failure E2E |
| UR-4.1 | ETH balance | pass | Dashboard balance E2E |
| UR-4.2 | Fiat equivalent | pass | Dashboard fiat E2E |
| UR-4.3 | History | pass | Dashboard history E2E |
| UR-4.4 | History filters | pass | Filter E2E; query validation unit test |
