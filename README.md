# BlockBallot — Blockchain-Based E-Voting System (Academic Prototype)

> [!IMPORTANT]
> **ACADEMIC DEMONSTRATION & RESEARCH PROTOTYPE**  
> BlockBallot is an academic engineering prototype developed for university evaluation and research.  
> * **Not Affiliated with ECI or UIDAI**: It is not an official portal of the Election Commission of India (ECI) or the Unique Identification Authority of India (UIDAI).  
> * **Synthetic Identities Only**: Operates strictly on synthetic voter records and isolated test environments.  
> * **Ballot Calldata Transparency**: The smart contract submits candidate selection in transaction calldata; cryptographic ballot secrecy is not mathematically guaranteed.

---

## 1. Project Overview

BlockBallot demonstrates how decentralized ledger technology and typed cryptography can be applied to parliamentary electronic voting. The system addresses double-voting prevention, authenticated voter eligibility, administrative election scheduling, strict live voting window enforcement, and verifiable audit receipts.

### Core Technology Stack
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Motion.
* **Backend**: Node.js, Express, Firebase Admin SDK.
* **Database & Persistence**: Google Cloud Firestore (and hermetic local Firestore Emulator).
* **Smart Contracts & Blockchain**: Solidity `^0.8.20`, OpenZeppelin Contracts (EIP-712, ECDSA), Hardhat local node (Chain ID `31337`), Ethers.js v6.
* **Cryptography**: HMAC-SHA256 OTP challenges, EIP-712 typed structured data signing, pseudonymous server-salted nullifiers.

---

## 2. Four Distinct Data Boundaries

BlockBallot strictly isolates its four electoral data categories:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BLOCKBALLOT DATA SEPARATION                     │
├────────────────────────────┬───────────────────────────────────────────┤
│ 1. Scenario A: Seeded Demo │ 2. Official 2024 Historical Archive       │
│ - ID: GE-2024 (Lok Sabha)  │ - Source: ECI Form 20 Gazette Data        │
│ - 4 Researched Divisions   │ - Immutable, read-only historical records │
│ - Ballots start at ZERO (0)│ - Never reused as current demo votes      │
├────────────────────────────┼───────────────────────────────────────────┤
│ 3. Scenario B: Admin-Made  │ 4. Independent Preference Poll            │
│ - Officer-created elections│ - Non-binding public opinion survey       │
│ - Start/end date controls  │ - 1 response per authenticated user       │
│ - Lifecycle state machine  │ - Zero impact on ballots or candidates    │
└────────────────────────────┴───────────────────────────────────────────┘
```

1. **Scenario A (Seeded 2024 Lok Sabha Demo Election)**: Seeded with researched 2024 candidates and official symbols for New Delhi, Varanasi, Wayanad, and Bangalore South. The demo ballot counter begins strictly at **zero (0)** for clean academic testing.
2. **Official 2024 Historical Reference Data**: Read-only archival results from the 2024 General Elections. Completely immutable and partitioned in `src/data/historical2024.ts`.
3. **Scenario B (Administrator-Created Elections)**: Created and scheduled by authorized Returning Officers with customizable start and closing deadlines, constituency rosters, and state machine controls (`draft`, `scheduled`, `active`, `paused`, `concluded`).
4. **Independent Party-Preference Poll**: An unofficial public-opinion research feature allowing citizens to record party preference. Fully separated from actual ballots and historical totals.

---

## 3. The Core Workflows

### Voter Journey: Login → Available Election → Select Candidate → Review → Confirm Vote → Receipt
1. **Voter Login**: Citizen enters synthetic EPIC Voter ID (e.g., `IND-DL-982341`).
2. **2FA Challenge**: Backend issues an HMAC-SHA256 protected OTP challenge with 60s cooldown and 3-attempt lockout.
3. **Authenticated Session**: Successful OTP verification issues a time-bound session token (15-minute TTL).
4. **Election Availability Check**:
   - System checks if an election is `active` and strictly within the configured live window (`startTime <= now < endTime`).
   - If no election is open, a prominent notice directs the voter to read-only Previous Elections.
5. **Constituency Resolution**: System resolves voter's enrolled constituency and displays contesting candidates with verified party symbols.
6. **Ballot Review & Wallet Selection**: Voter selects candidate, reviews choice, and chooses between Academic Testnet Signer and MetaMask.
7. **EIP-712 Authorization**: Backend validates active election status and deadlines, generates an off-chain nullifier, and signs an EIP-712 authorization ticket.
8. **On-Chain Execution**: Contract verifies signature, validates `msg.sender == voterWallet`, checks for duplicate nullifier, burns nullifier, and increments candidate tally.
9. **Cryptographic Receipt**: System presents a verifiable receipt containing transaction hash, block number, nullifier, and timestamp. Duplicate voting is permanently blocked.

### Administrator Journey: Login → Manage Elections → Configure Deadlines → Control Voting → Audit Results
1. **Officer Login**: Sign in using the local demo administrator account or verified Firebase ID token.
2. **Election Creation**: Configure title, election type, numeric identifier, constituency enrollment, and verified deadlines (`endTime > startTime`).
3. **Lifecycle Control**: Manage transitions across `draft` → `scheduled` → `active` → `paused` → `concluded`.
4. **Candidate Nominations**: Register candidates and political party symbols prior to election activation.
5. **Real-Time Audit**: Review immutable audit trail of all state transitions and anonymous vote counts.

---

## 4. Quickstart & Academic Demo Guide

### Prerequisites
* Node.js $\ge 20.x$
* Windows PowerShell (or compatible terminal)

### Step 1: Install Dependencies
```powershell
npm ci
```

### Step 2: Start Local Blockchain & Deploy Contract
```powershell
# Terminal 1: Start local Hardhat node (Chain ID 31337)
npm run node:start

# Terminal 2: Deploy smart contract and initialize demo election
npm run contract:deploy
```

### Step 3: Seed Local Demo Administrator Account
Provision the isolated local academic administrator credentials:
```powershell
# Terminal 2: Generate local demo credentials and configure local store/emulator
npm run admin:seed
```
* **Demo Login Email**: `demo.admin@blockballot.local`
* **Demo Password**: Automatically generated and written **exclusively** to the ignored `.env.local` file.
* **Fail-Closed Security**: In production (`NODE_ENV=production`), the demo admin account and password gateway are completely disabled (403 Forbidden).

### Step 4: Start the Application Server
```powershell
# Terminal 2: Launch Vite & Express integrated server
npm run dev
```
Open your browser to: [http://127.0.0.1:3000](http://127.0.0.1:3000)

---

## 5. Demonstration Walkthrough

### A. Signing in as Local Demo Administrator
1. Navigate to [http://127.0.0.1:3000](http://127.0.0.1:3000) and click **Admin Portal** (or visit `/admin`).
2. Enter:
   * **Email**: `demo.admin@blockballot.local`
   * **Password**: Copy the generated password from `.env.local` (or output of `npm run admin:seed`).
3. Click **Sign In**.
4. You are granted full Returning Officer privileges to create elections, configure deadlines, pause/resume voting, and inspect audit logs.

### B. Authenticating a Synthetic Demo Voter
Use one of the pre-configured academic test electors:
| Synthetic EPIC ID | Constituency | Name |
| :--- | :--- | :--- |
| `IND-DL-982341` | New Delhi | Rajesh Sharma |
| `IND-UP-561289` | Varanasi | Amit Kumar |
| `IND-KL-341908` | Wayanad | Priya Nair |
| `IND-KA-782345` | Bangalore South | Suresh Rao |

1. On the Voter Portal, enter the synthetic EPIC ID.
2. In academic demo mode, the 6-digit OTP is displayed on screen / console for demonstration convenience.
3. Enter the OTP to receive a 15-minute authenticated voter session.

### C. Live Voting Window Enforcement
Voting is permitted **only** when an election satisfies:
$$\text{status} = \text{active} \quad \land \quad \text{startTime} \le \text{now} < \text{endTime}$$
* **Scheduled Elections**: Displayed with countdown to start time; voting is locked.
* **Paused Elections**: Temporarily halted by administrator; voting action disabled on server and contract.
* **Concluded / Closed Elections**: Voting closed; submissions rejected at API and contract levels.
* **When No Election is Open**: Displays message *"No elections are currently open for voting."* with a direct link to Previous Elections.

### D. Previous Elections (Read-Only Archive)
Navigate to **Previous Elections** from the top navigation or election availability screen:
* **Prototype & Admin Elections**: View past demo elections (e.g., `DEMO-PREV-2023`), final vote tallies, EVM contract addresses, and immutable audit logs. No vote-casting buttons are exposed.
* **Official 2024 Reference Archive**: View verified ECI Form 20 Gazette results for 2024 Lok Sabha divisions, completely isolated from demo test ballots.

### E. Resetting Local Demo Data
To reset test votes back to zero:
```powershell
# Re-deploy contract and reset in-memory / emulator tallies
npm run contract:deploy
```
* This operation resets only the academic test state. Official 2024 historical reference data is immutable and unaffected.

---

## 6. Verification Commands

Run the full verification suite to validate system integrity:

```powershell
# 1. Static Typecheck (0 errors)
npm run lint

# 2. Automated Test Suite (15 test files, 114 test assertions: 100% passed)
npm test

# 3. Dedicated Live Blockchain Integration Tests (Fails closed if node is offline)
npm run test:integration

# 4. Repeatable Gas and Latency Benchmark Suite
npm run benchmark

# 5. Live Local Firestore Emulator Integration Tests
npm run emulator:test

# 6. Production Bundle Build (Vite production build: dist/ in < 1s)
npm run build
```

---

## 7. Requirements Traceability (Academic Specification vs Implementation)

| Original Requirement | Architectural Specification | Implementation Files & Routes | Verification Evidence | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Voter Identity & OTP** | Standard 10-char alphanumeric EPIC format with rate-limited 6-digit OTP valid for 180 seconds | `server/routes/voter.ts` (`/verify`, `/lookup`, `/verify-otp`) | `src/test/crypto.test.ts`, `src/test/ux_redesign.test.ts` | **Implemented** |
| **Session Management** | RFC 7519 / HS256 signed JWT bearer tokens with issuer/audience validation and revocation | `server/crypto.ts` (`createVoterJwt`), `server/store.ts` (`createSession`) | `src/test/crypto.test.ts`, `src/test/phase7f_final_completion.test.ts` | **Implemented** |
| **Off-Chain Data Protection** | Salted HMAC-SHA256 indexing (`epicHash`), masked mobile numbers, zero plaintext OTP storage | `server/crypto.ts`, `server/firestore.ts`, `firestore.rules` | `src/test/crypto.test.ts`, `src/test/phase7a2_emulator_integration.test.ts` | **Implemented** |
| **Constituency Eligibility** | Electors can only vote for candidates in their registered constituency | `server/routes/voter.ts` (`/authorization`), `contracts/IndianElection.sol` | `src/test/phase7f_final_completion.test.ts` (Test 4) | **Implemented** |
| **One-Person / One-Vote** | Status lifecycle transition from `ELIGIBLE` -> `AUTHORIZED` -> `VOTED` + Nullifier burning | `server/routes/voter.ts` (`/record-vote`), `contracts/IndianElection.sol` | `src/test/eip712.test.ts`, `src/test/contract_guards.test.ts` | **Implemented** |
| **Live Voting Windows** | Strict time boundaries rejecting votes before start, at closing, or after closing | `server/routes/voter.ts` (`/authorization`), `contracts/IndianElection.sol` | `src/test/phase7f_final_completion.test.ts` (Test 3) | **Implemented** |
| **Admin Election Lifecycle** | State machine: `draft` -> `scheduled` -> `active` -> `paused` -> `concluded` | `server/routes/admin.ts` (`/status`), `server/store.ts` | `src/test/ux_redesign.test.ts` (Test 8) | **Implemented** |
| **Admin Candidate Nomination** | Candidate registration with ECI symbol verification and nomination lock | `server/routes/admin.ts` (`/candidates`), `server/store.ts` | `src/test/phase5_election_management.test.ts` (Test 3) | **Implemented** |
| **Read-Only Concluded Archive** | Concluded elections displayed for public audit without voting forms | `src/components/screens/ElectionsResultsScreen.tsx` | `src/test/phase7f_final_completion.test.ts` (Test 5) | **Implemented** |
| **Persistent Audit Logging** | Append-only audit events for election states, logins, authorizations, and votes | `server/store.ts` (`recordAuditEvent`), `server/firestore.ts` | `src/test/phase7f_final_completion.test.ts` (Test 7) | **Implemented** |
| **Restart Recovery & Sync** | Server restores all election state from Firestore on boot | `server.ts`, `server/store.ts` (`syncFromFirestore`) | `src/test/phase7f_final_completion.test.ts` (Test 7) | **Implemented** |

### Intentionally Excluded Tasks (Scope Boundaries)
1. **Public Cloud Resource Provisioning**: AWS ECS, EKS, RDS, or CloudFront creation is excluded to prevent cloud costs.
2. **Production Government Integrations**: Live connections to ECI NVSP/VHA portal or UIDAI Aadhaar biometric servers are prohibited outside authorized national agencies.
3. **ZK-SNARKs Ceremony & Verifier**: While candidate choice is separated from identity via cryptographic nullifiers, full zero-knowledge tally encryption is deferred as documented future work.

---

## 8. Staging Credentials & Secrets Security

* **Local Environment (`.env.local`)**: Contains local secrets (demo admin password, local salts). Gitignored and never committed.
* **Production Deployment**: Real cloud deployments must configure environment variables directly in cloud secret managers (e.g., AWS Secrets Manager or GCP Secret Manager).
* **Compromised Credentials Note**: If any legacy credentials were historically committed to Git, they must be considered compromised and revoked at the cloud provider level. Never reuse development keys in production.

---

## 9. Project Documentation Index

* [**Final Verification and Gap Closure Report**](file:///E:/Projects/BlockBallot-EVoting-System/docs/FINAL_VERIFICATION_AND_GAPS.md) — *Authoritative requirement-by-requirement audit & benchmarks*
* [Configuration Reference Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/CONFIGURATION_REFERENCE.md)
* [Firebase Staging Setup Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/FIREBASE_STAGING_GUIDE.md)
* [AWS Staging Architecture & Cost Notes](file:///E:/Projects/BlockBallot-EVoting-System/docs/AWS_STAGING_ARCHITECTURE.md)
* [Staging & Operations Runbook](file:///E:/Projects/BlockBallot-EVoting-System/docs/STAGING_RUNBOOK.md)
* [Voter Workflow Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/VOTER_WORKFLOW_GUIDE.md)
* [Administrator Workflow Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/ADMIN_WORKFLOW_GUIDE.md)
* [Security & Limitations Document](file:///E:/Projects/BlockBallot-EVoting-System/docs/SECURITY_AND_LIMITATIONS.md)
* [Academic Demonstration Checklist](file:///E:/Projects/BlockBallot-EVoting-System/docs/ACADEMIC_DEMO_CHECKLIST.md)

---

## 9. License & Academic Disclaimer

Academic demonstration project. Distributed under the Apache-2.0 License. Not authorized for legally binding public elections.
