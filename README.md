# BlockBallot — Blockchain-Based E-Voting System (Academic Prototype)

> [!IMPORTANT]
> **ACADEMIC DEMONSTRATION & RESEARCH PROTOTYPE**  
> BlockBallot is an academic engineering prototype developed for university evaluation and research.  
> * **Not Affiliated with ECI or UIDAI**: It is not an official portal of the Election Commission of India (ECI) or the Unique Identification Authority of India (UIDAI).  
> * **Synthetic Identities Only**: Operates strictly on synthetic voter records and isolated test environments.  
> * **Ballot Calldata Transparency**: The smart contract submits candidate selection in transaction calldata; cryptographic ballot secrecy is not mathematically guaranteed.

---

## 1. Project Overview

BlockBallot demonstrates how decentralized ledger technology and typed cryptography can be applied to parliamentary electronic voting. The system addresses double-voting prevention, authenticated voter eligibility, administrative election scheduling, and verifiable audit receipts.

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

1. **Scenario A (Seeded 2024 Lok Sabha Demo Election)**: Seeded with researched 2024 candidates and official symbols for New Delhi, Varanasi, Wayanad, and Bangalore South. The demo ballot counter begins strictly at **zero (0)** for clean testing.
2. **Official 2024 Historical Reference Data**: Read-only archival results from the 2024 General Elections. Completely immutable and partitioned in `src/data/historical2024.ts`.
3. **Scenario B (Administrator-Created Elections)**: Created and scheduled by authorized Returning Officers with customizable start and closing deadlines, constituency rosters, and state machine controls (`draft`, `scheduled`, `active`, `paused`, `concluded`).
4. **Independent Party-Preference Poll**: An unofficial public-opinion research feature allowing citizens to record party preference. Fully separated from actual ballots and historical totals.

---

## 3. The Voter Journey

1. **Voter Login**: Citizen enters synthetic EPIC Voter ID (e.g., `IND-DL-982341`).
2. **2FA Challenge**: Backend issues an HMAC-SHA256 protected OTP challenge with 60s cooldown and 3-attempt lockout.
3. **Authenticated Session**: Successful OTP verification issues a time-bound session token (15-minute TTL).
4. **Constituency Resolution**: System resolves voter's enrolled constituency and displays contesting candidates with verified party symbols.
5. **Ballot Review & Wallet Selection**: Voter selects candidate, reviews choice, and chooses between Academic Testnet Signer and MetaMask.
6. **EIP-712 Authorization**: Backend validates active election status and deadlines, generates an off-chain nullifier, and signs an EIP-712 authorization ticket.
7. **On-Chain Execution**: Contract verifies signature, validates `msg.sender == voterWallet`, checks for duplicate nullifier, burns nullifier, and increments candidate tally.
8. **Cryptographic Receipt**: System presents a verifiable receipt containing transaction hash, block number, nullifier, and timestamp.

---

## 4. Quickstart Guide

### Prerequisites
* Node.js $\ge 20.x$
* Windows PowerShell (or compatible bash terminal)

### Step 1: Install Dependencies
```powershell
npm ci
```

### Step 2: Start Local Blockchain & Deploy Contract
```powershell
# In Terminal 1: Start local Hardhat node (Chain ID 31337)
npm run node:start

# In Terminal 2: Deploy contract and seed demo election
npm run contract:deploy
```

### Step 3: Start the Application Server
```powershell
# In Terminal 2: Launch Vite & Express integrated server
npm run dev
```
Open your browser to: [http://127.0.0.1:3000](http://127.0.0.1:3000)

---

## 5. Verification Commands

```powershell
# 1. Static Typecheck
npm run lint

# 2. Automated Test Suite (96 tests across all phases)
npm test

# 3. Production Bundle Build
npm run build
```

---

## 6. Project Documentation Index

* [Configuration Reference Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/CONFIGURATION_REFERENCE.md)
* [Firebase Staging Setup Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/FIREBASE_STAGING_GUIDE.md)
* [AWS Staging Architecture & Cost Notes](file:///E:/Projects/BlockBallot-EVoting-System/docs/AWS_STAGING_ARCHITECTURE.md)
* [Staging & Operations Runbook](file:///E:/Projects/BlockBallot-EVoting-System/docs/STAGING_RUNBOOK.md)
* [Voter Workflow Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/VOTER_WORKFLOW_GUIDE.md)
* [Administrator Workflow Guide](file:///E:/Projects/BlockBallot-EVoting-System/docs/ADMIN_WORKFLOW_GUIDE.md)
* [Security & Limitations Document](file:///E:/Projects/BlockBallot-EVoting-System/docs/SECURITY_AND_LIMITATIONS.md)
* [Academic Demonstration Checklist](file:///E:/Projects/BlockBallot-EVoting-System/docs/ACADEMIC_DEMO_CHECKLIST.md)

---

## 7. License & Disclaimer

Academic demonstration project. Distributed under the Apache-2.0 License. Not authorized for legally binding public elections.
