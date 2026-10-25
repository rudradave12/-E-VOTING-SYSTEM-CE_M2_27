# BlockBallot — Phase 13: Release Readiness & Deployment Specification

**Document ID**: `DOC-BB-PH13-RELEASE-001`  
**Target Repository**: `rudradave12/blockballot-e-voting-system`  
**Baseline Branch**: `feature/simulation-voter-registry-rbac`  
**Baseline Commit**: `340def9` (`feat(ui): integrate responsive and accessible BlockBallot experience`)  
**Evaluation Standard**: Academic Simulation & Security Verification (Strictly non-certified for legally binding public elections)  
**Date**: October 2026  

---

## 1. Executive Release Decisions & Certification Boundary

Following the comprehensive Phase 13 security audit, cryptographic review, and 25-control automated verification suite, the release decisions for the BlockBallot E-Voting System are formally rendered as follows:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 FINAL RELEASE DECISION                                 │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│ Environment / Target Deployment           │ Formal Outcome & Status                    │
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ 1. Production Public Election Release     │ ❌ BLOCKED (OUTCOME C: NOT PRODUCTION READY)│
│    (Legally Binding Electoral Contests)   │ Critical Defect: BB-SEC-PH09-BALLOT-SECRECY│
├───────────────────────────────────────────┼────────────────────────────────────────────┤
│ 2. Academic Simulation & Research Sandbox │ ✅ READY (OUTCOME B: SIMULATION READY)     │
│    (Demonstrations, University Research)  │ All 25 Controls Passed; Disclaimers Active │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

### 1.1 Production Release Blocker (Outcome C)
BlockBallot is **STRICTLY BLOCKED** from deployment in any legally binding public election, government electoral contest, or high-stakes ballot.
* **Root Cause**: In `contracts/IndianElection.sol`, the candidate selection (`_candidateId`) is submitted as plaintext calldata, emitted as an indexed log topic in `VoteCast`, updates on-chain vote totals in real time, and is directly linked to the voter's Ethereum address (`msg.sender`).
* **Statutory Violation**: This transparency violates the foundational secrecy of the ballot mandated by Section 94 of the Representation of the People Act, 1951, Indian Constitutional principles (Right to Privacy under Article 21 / *K.S. Puttaswamy v. Union of India*), and universal democratic standards.
* **Remediation Requirement**: A production release requires replacing plaintext on-chain candidate tracking with a zero-knowledge verifiable voting protocol (e.g., Groth16/Plonk zk-SNARKs with an on-chain verifier or MACI off-chain tallying), along with gas-sponsored relayers (EIP-4337) to disassociate voter wallets from ballot submissions.

### 1.2 Academic Simulation Release Approval (Outcome B)
BlockBallot is **APPROVED AND READY** for academic research demonstrations, computer science coursework, pedagogical defense, and interactive conference simulations under the following mandatory prerequisites:
1. The deployment must execute on local testnets (Hardhat `chainId: 31337`) or isolated sandbox testnets (e.g., Sepolia).
2. The prominent UI academic disclaimers and privacy notices (introduced across Phases 00–12) must remain permanently enabled.
3. All registered voters and election records must use synthetic demographic data.

---

## 2. System Architecture & Prerequisites

### 2.1 Runtime Environment Requirements
* **Node.js**: `v20.x`, `v22.x`, or `v24.x` (CI/CD and test suite validated on Node `v24.16.0`).
* **npm**: Version `10.x` or higher.
* **Operating System**: Linux (Ubuntu 22.04+), macOS (13+), or Windows 11 / WSL2.
* **Memory**: Minimum 4 GB RAM (8 GB recommended for concurrent Vite dev server, Hardhat EVM node, and test execution).
* **Storage**: Minimum 2 GB free disk space.

### 2.2 Core Software Dependencies
* **Frontend**: React `19.0.0`, Vite `6.x` / `8.x`, Lucide React, Canvas Confetti.
* **Backend**: Node.js `http`, Express `4.x`, Ethers.js `v6.13.4`, Firebase Admin `v12.x`.
* **Blockchain Tooling**: Hardhat `v2.22.18`, Solidity `^0.8.20`.
* **Testing Engine**: Node Native Test Runner (`tsx --test`), Supertest `v7.0.0`.

---

## 3. Environment Configuration & Secret Management

The system enforces fail-closed configuration validation via `server/config.ts` (`validateServerConfig()`). If any required variable is missing or if deterministic development keys are detected in a production environment (`NODE_ENV === 'production'`), startup is immediately aborted with a fatal error.

### 3.1 Environment Variable Specification

| Variable Name | Environment | Description | Production Constraint |
| :--- | :--- | :--- | :--- |
| `PORT` | All | Port on which the Express API server listens (default: `3000`). | Valid integer port (e.g., `8080`). |
| `NODE_ENV` | All | Application execution mode (`development`, `test`, `production`). | Must be `production` in live staging. |
| `APP_ENCRYPTION_KEY` | All | 32-byte (64 hex characters) key for AES-256-GCM database field encryption. | **Must be randomly generated**. Rejection of sample key `0123456789abcdef...`. |
| `AUTHORIZATION_SIGNER_PRIVATE_KEY`| All | Secp256k1 private key for EIP-712 voting authorization tickets. | **Must be dedicated HSM/KMS key**. Rejection of Hardhat dev keys (`0xac09...`). |
| `HMAC_SECRET` | All | High-entropy secret for OTP generation and session token HMACs. | Minimum 32 random characters. |
| `SERVER_COMMITMENT_SALT` | All | Cryptographic salt for voter nullifier derivation. | Minimum 32 random characters. |
| `HARDHAT_RPC_URL` | Dev / Sim | RPC endpoint of Ethereum EVM node (default: `http://127.0.0.1:8545`). | Dedicated RPC provider in staging. |
| `INDIAN_ELECTION_CONTRACT_ADDRESS`| All | Hex address of deployed `IndianElection.sol` contract. | Valid `0x` checksummed address. |
| `FIREBASE_PROJECT_ID` | Prod / Staging | Google Cloud Project ID for Firebase Firestore. | Valid GCP project. |
| `FIREBASE_DATABASE_ID` | Prod / Staging | Firestore database instance (default: `(default)`). | Valid database ID. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Prod / Staging | Path to service account JSON key file with Firestore permissions. | Strict OS file permissions (`0600`). |

### 3.2 Production vs Development Sample Configs

#### Development / Academic Simulation (`.env`)
```bash
PORT=3000
NODE_ENV=development
APP_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
AUTHORIZATION_SIGNER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
HMAC_SECRET=dev-academic-hmac-secret-strictly-for-testing-only-32chars
SERVER_COMMITMENT_SALT=dev-salt-strictly-for-academic-testing-only-32chars
HARDHAT_RPC_URL=http://127.0.0.1:8545
INDIAN_ELECTION_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

#### Production Staging Checklist (`.env.production`)
```bash
# ALL KEYS MUST BE INJECTED SECURELY VIA SECRET MANAGER (E.G., GCP SECRET MANAGER / VAULT)
PORT=8080
NODE_ENV=production
# Generate: openssl rand -hex 32
APP_ENCRYPTION_KEY=<SECURE_64_HEX_CHAR_KEY>
# Dedicated authorization signer key (never reused as deployer or admin wallet)
AUTHORIZATION_SIGNER_PRIVATE_KEY=<SECURE_SECP256K1_PRIVATE_KEY>
# Generate: openssl rand -base64 32
HMAC_SECRET=<SECURE_RANDOM_SECRET>
SERVER_COMMITMENT_SALT=<SECURE_RANDOM_SALT>
HARDHAT_RPC_URL=https://rpc.sepolia.org
INDIAN_ELECTION_CONTRACT_ADDRESS=<DEPLOYED_CONTRACT_ADDRESS>
FIREBASE_PROJECT_ID=blockballot-staging-prod
FIREBASE_DATABASE_ID=(default)
```

---

## 4. Administrative Accounts & Demo Credentials Security

BlockBallot preconfigures three official administrative personas for academic demonstration. In production, these personas must be transitioned to enterprise IAM or Indian Government Single Sign-On (MeriPehchan / Jan Parichay).

### 4.1 Officer Personas & Access Boundaries

| Role | Username / Email | Default Demo Password | Permitted Jurisdictions | Granted Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin (ECI)** | `admin@eci.gov.in` | `Admin@123` | National (All States & Constituencies) | Full election administration, officer provisioning, global audit logs, emergency pause. |
| **Election Officer (EO)**| `eo.delhi@eci.gov.in`| `Delhi@123` | State Level: NCT of Delhi (`U05`) | Candidate approval, voting-time exception review, supervised recovery unlock. |
| **Voter Registration Officer (VRO)**| `vro.nd@eci.gov.in`| `VroND@123` | Assembly Level: New Delhi (`4`) | Synthetic voter enrollment, biometric verification, enrollment exception request. |

### 4.2 Credential Hardening & Migration Guidelines
> [!CAUTION]
> **DEMO PASSWORDS MUST NEVER BE USED IN PRODUCTION OR PUBLIC STAGING.**

1. **Password Hashing**: Production officer authentication must migrate from local salt/hash comparisons to PBKDF2 (`iterations >= 600,000`) or Argon2id.
2. **Multi-Factor Authentication (MFA)**: Administrative logins in staging/production must mandate FIDO2/WebAuthn hardware security keys or TOTP (RFC 6238).
3. **Session Invalidation**: Officer tokens expire after 4 hours of inactivity. An emergency revoke endpoint invalidates all active officer sessions immediately.

---

## 5. Persistence & Firestore Rules Deployment

BlockBallot uses Firebase Firestore for authoritative off-chain storage. In development, the system falls back seamlessly to an in-memory repository cache (`server/store.ts`). In production, Firestore security rules enforce strict least-privilege boundaries.

### 5.1 Firestore Rules Deployment Procedure
Deploy rules using the Firebase CLI:
```bash
# Authenticate with Google Cloud / Firebase
firebase login

# Set active project
firebase use <YOUR_FIREBASE_PROJECT_ID>

# Deploy security rules
firebase deploy --only firestore:rules
```

### 5.2 Security Boundary Verification
The deployed `firestore.rules` file enforces:
* **`voter_profiles`**: Direct client writes are blocked (`allow write: if false;`). Reads are restricted to the authenticated profile owner (`request.auth.uid == profileId`) or administrators.
* **`biometric_enrollments`**: Completely hidden from client read/write (`allow read, write: if false;`). Accessible only via backend service account with field-level AES-256-GCM encryption.
* **`manual_id_exceptions`**: Denies all direct client access (`allow read, write: if false;`). Managed strictly via authoritative `/api/admin/exceptions` endpoints.
* **`voting_sessions`**: Denies all client access (`allow read, write: if false;`). Tokens and lockouts exist only in server memory and backend Firestore collections.
* **`historical_elections` & `historical_constituencies`**: Publicly readable, write-protected (`allow write: if false;`).

---

## 6. Blockchain & Smart Contract Deployment Runbook

### 6.1 Starting the EVM Local Node
In Terminal 1, start the Hardhat local node:
```bash
npx hardhat node
```
This initializes an EVM node on `http://127.0.0.1:8545` with 20 pre-funded test accounts (10,000 ETH each) and chain ID `31337`.

### 6.2 Compiling & Deploying `IndianElection.sol`
In Terminal 2:
```bash
# 1. Compile smart contracts
npx hardhat compile

# 2. Deploy IndianElection contract to local node
npx hardhat run scripts/deploy.js --network localhost
```

The deployment script outputs:
```
Deploying IndianElection contract...
IndianElection deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Authorization Signer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### 6.3 Synchronizing Contract Configuration
Ensure the deployed contract address matches `INDIAN_ELECTION_CONTRACT_ADDRESS` in `.env` and `src/contracts/addresses.json`.

---

## 7. Backup, Recovery & Disaster Recovery Protocols

### 7.1 Firestore Automated Backups
For production staging, schedule daily Firestore exports to Google Cloud Storage:
```bash
gcloud firestore export gs://blockballot-backup-bucket/$(date +%Y%m%d_%H%M%S) \
  --project=blockballot-staging-prod
```

### 7.2 EVM Ledger State & Resynchronization
* The Ethereum blockchain serves as the immutable single source of truth for vote counts and nullifier state.
* If the backend server crashes or restarts, it automatically resynchronizes election tallies and voter participation states by querying contract events (`VoteCast`, `ElectionCreated`, `CandidateAdded`) via the Ethers.js provider.

### 7.3 Emergency Circuit Breaker (Election Pause)
If malicious activity, tampering, or physical emergency occurs at polling stations:
1. **On-Chain Pause**: The contract owner executes `pauseElection(uint256 _electionId)` on `IndianElection.sol`. Any subsequent `castVote` reverts with `BlockBallot: Election is paused`.
2. **Backend Pause**: An authorized Election Officer sends `POST /api/admin/elections/:id/pause`. The backend reconciles status and blocks new voter authorization tickets.

---

## 8. Release Verification & Pre-Flight Quality Gate

Prior to packaging or demonstrating any release, the following automated quality gates must be executed sequentially and pass with zero errors:

```bash
# 1. Static Type Checking & Code Quality
npm run lint

# 2. Production Frontend Bundle Build
npm run build

# 3. Comprehensive Unit & Regression Test Suite
npm test

# 4. Phase 13 Final Security Audit & Verification Suite (All 25 Workflows)
npx tsx --test src/test/phase13_final_security_audit.test.ts

# 5. Secret Scan of Git-Tracked Files
git grep -E -i "private_key.*[0-9a-f]{64}|AKIA[0-9A-Z]{16}" -- ':!*.test.ts' ':!.env.example' ':!test-keys.json'
```

### 8.1 Quality Gate Verification Results
* `npm run lint`: **PASS** (`tsc --noEmit` exited with code 0).
* `npm run build`: **PASS** (Vite compiled client bundle cleanly, zero server imports, bundle size ~1.34 MB).
* `npm test`: **PASS** (100% of existing regression test files passing).
* `src/test/phase13_final_security_audit.test.ts`: **PASS** (26/26 test cases passed, all 25 workflows verified).
* Secret Scan: **PASS** (Zero active production secrets or credentials in git index).

---

## 9. Release Sign-Off Matrix

| Evaluation Domain | Target Standard | Audit Result | Sign-Off Status |
| :--- | :--- | :--- | :--- |
| **Voter Registry & EPIC Verification** | Synthetic simulation with masked PII | Verified | ✅ **APPROVED FOR SIMULATION** |
| **Role-Based Access Control (RBAC)** | Fail-closed, granular permissions | Verified | ✅ **APPROVED FOR SIMULATION** |
| **Biometric & Physical-ID Exceptions**| Multi-officer approval, single-use | Verified | ✅ **APPROVED FOR SIMULATION** |
| **Voting Session & Fullscreen Locks** | 3-strike server lock, supervised recovery| Verified | ✅ **APPROVED FOR SIMULATION** |
| **Cryptographic Utilities (AES/EIP-712)**| AES-256-GCM, EIP-712 domain binding | Verified | ✅ **APPROVED FOR SIMULATION** |
| **Public Monitor & Transparency** | Aggregates only, zero PII | Verified | ✅ **APPROVED FOR SIMULATION** |
| **Ballot Secrecy & On-Chain Privacy** | Zero-knowledge verifiable tallying | **FAILED** (`BB-SEC-PH09-BALLOT-SECRECY`) | ❌ **REJECTED FOR PRODUCTION** |
| **OVERALL SYSTEM RELEASE** | **Academic Research & Simulation** | **PASSED** | ✅ **OUTCOME B: SIMULATION READY** |
| **OVERALL SYSTEM RELEASE** | **Legally Binding Public Elections** | **BLOCKED** | ❌ **OUTCOME C: PRODUCTION BLOCKED** |

---

**Certified by**: BlockBallot Lead Security Auditor & Architecture Pair  
**Repository**: `rudradave12/blockballot-e-voting-system`  
**Branch**: `feature/simulation-voter-registry-rbac`
