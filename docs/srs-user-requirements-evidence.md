# SRS user-requirements evidence

Source: `SRS/Abdallah Namoura SRS 2.0.pdf`, section 5.1.3. The machine-readable record is [srs-user-requirements-evidence.json](srs-user-requirements-evidence.json). Each requirement is evaluated separately: missing or failing listed tests make that requirement **fail**.

| Requirement | Area | Status | Automated evidence |
| --- | --- | --- | --- |
| UR-1.1 | Account registration | pass | Password policy unit test; registration conflict notification E2E |
| UR-1.2 | Account login | pass | Login success notification E2E |
| UR-1.3 | Password recovery | pass | Ownership-code verification followed by password reset E2E |
| UR-2.1 | Wallet connection | pass | Wallet connection success E2E |
| UR-2.2 | Wallet disconnection | pass | Wallet unlink E2E |
| UR-2.3 | Wallet notifications | pass | No wallet, provider unavailable, request rejected, empty-account failure, and backend-link failure E2E |
| UR-2.4 | Signed wallet ownership | pass | Wallet connection E2E (challenge, signature, link flow) |
| UR-2.5 | Wallet status | pass | Wallet unlink E2E |
| UR-3.1 | Send to address or registered user | pass | Authenticated API send test; registered-user recipient E2E |
| UR-3.2 | Transaction summary | pass | Recipient and amount summary assertions E2E |
| UR-3.3 | Confirm/cancel transfer | pass | Confirm-and-submit E2E plus cancellation-without-submit E2E |
| UR-3.4 | Transaction statuses | pass | Pending, terminal success, and terminal failure E2E |
| UR-4.1 | Native BNB balance | pass | Dashboard native-balance E2E |
| UR-4.2 | Fiat equivalent | pass | Dashboard fiat E2E |
| UR-4.3 | History | pass | Complete returned-history list and count E2E |
| UR-4.4 | History filters | pass | Filter E2E; query validation unit test |
