# BlockBallot — Voter Workflow & User Journey Guide

> [!NOTE]
> **Academic Prototype Walkthrough**  
> This guide outlines how an eligible test voter navigates the authentication, ballot selection, cryptographic authorization, and receipt confirmation processes in BlockBallot.

---

## 1. End-to-End Voter Flow Diagram

```
[1. Enter EPIC] ──▶ [2. 6-Digit OTP] ──▶ [3. Active Session] ──▶ [4. Candidate Selection]
                                                                        │
[8. Audit Receipt] ◀── [7. On-Chain Mint] ◀── [6. EIP-712 Ticket] ◀─── [5. Wallet Selection]
```

---

## 2. Step-by-Step Walkthrough

### Step 1: Elector Identification (`IdentifyScreen.tsx`)
* **Voter Input**: Citizen inputs their registered Electoral Photo Identity Card (EPIC) number.
* **Phase 01 Status — Demo Voter Accounts Retired**:
  * Preloaded demo voter accounts (`IND-DL-982341`, `IND-DL-339210`, `IND-UP-441209`, `IND-KL-772183`, `IND-KA-550912`, `IND-DL-999000`) have been removed from normal runtime operation.
  * Identification operates strictly fail-closed: client-side array lookups and hardcoded demo shortcuts have been removed.
  * The identification request must be validated by the server-side API (`POST /api/voter/verify`).
  * Retired legacy demo IDs are rejected with `404 Not Found` unless enrolled in the registry.
  * Simulation voter registry generation and enrollment will be introduced in Phase 04.
  * Safe cleanup of existing Firestore records is supported via `npm run voters:cleanup -- --dry-run` (default mode).
  * Demo administrator access remains supported via `npm run admin:seed`.
  * *Notice*: This phase does not implement biometric capture (fingerprint/facial), ECI portal connections, or live production election readiness.
* **Backend Validation**:
  * Calls `POST /api/voter/verify`.
  * Verifies elector roll enrollment and checks that `status !== 'VOTED'`.
  * Enforces a 60-second cooldown rate limit per EPIC to prevent enumeration attacks.
  * Masks voter mobile number (e.g., `+91 ••••• •4589`).

### Step 2: Two-Factor OTP Verification (`OtpScreen.tsx`)
* **Challenge Issuance**: Server computes `HMAC-SHA256(otp, SERVER_HMAC_SECRET)` and sets a 5-minute expiry with a maximum of 3 attempts.
* **Test Delivery Code**: In development mode, the synthetic delivery code is provided directly in the interface for easy testing.
* **Submission**: Voter submits the 6-digit verification code to `POST /api/voter/verify-otp`.
* **Lockout Guard**: Incorrect attempts decrement the counter; exceeding 3 attempts locks the challenge.
* **Session Token**: On match, the challenge is marked `isUsed = true`, voter status advances to `AUTHORIZED`, and a cryptographically random session token (15-minute TTL) is returned.

### Step 3: Constituency Resolution & Candidate Selection (`CandidatesScreen.tsx`)
* **Enrolled Constituency**: The system automatically queries `/api/candidates?constituencyId=...` for the voter's assigned district.
* **Candidate Display**: Lists all registered candidates with verified ECI party symbols (e.g., Lotus, Hand, Broom, Elephant, Corn & Sickle) and democratic neutral option (*None of the Above - NOTA*).
* **Selection**: Voter selects exactly one candidate and clicks **Proceed to Review**.

### Step 4: Ballot Review (`ReviewScreen.tsx`)
* **Review Screen**: Displays chosen candidate, party name, constituency, and polling station.
* **Confirmation Prompt**: Requires explicit voter confirmation before proceeding to cryptographic wallet authorization.

### Step 5: Wallet Selection & Authorization (`MetaMaskScreen.tsx`)
* **Dual Wallet Support**:
  1. **Academic Testnet Signer**: Generates an in-memory browser test keypair with zero configuration needed.
  2. **MetaMask Extension**: Connects the voter's external Web3 browser extension.
* **EIP-712 Request**: The frontend calls `POST /api/voter/authorization` with `sessionToken`, `voterWallet`, and `electionId`.
* **Backend Authorization Checks**:
  1. Election status must be `active`.
  2. Current time must be within `startTime` and `endTime`.
  3. Voter must be enrolled in an active constituency for that election.
  4. Nullifier reconciliation: checks if `spentNullifiers(electionId, nullifier)` is already true on-chain.
* **Server Signer**: Returns a signed EIP-712 typed data ticket containing `(electionId, constituencyId, voterWallet, nullifier, expiry)`.

### Step 6: Blockchain Transaction Submission
* The browser submits `IndianElection.castVote(...)` with the signed ticket and chosen `candidateId`.
* **Contract Verification**:
  1. Checks `msg.sender == ticket.voterWallet`.
  2. Verifies EIP-712 signature matches `authorizationSigner`.
  3. Checks `block.timestamp <= ticket.expiry`.
  4. Checks `!spentNullifiers[electionId][nullifier]`.
* **State Updates**:
  * Burns the nullifier (`spentNullifiers = true`).
  * Increments candidate tally and total election vote count.
  * Emits `VoteCast(electionId, constituencyId, candidateId, nullifier)`.

### Step 7: Final Receipt (`ReceiptScreen.tsx`)
* **Transaction Hash**: Displays the verifiable transaction hash and block number.
* **Voter Status**: Server updates voter record to `VOTED` and increments constituency turnout.
* **Audit Notice**: System confirms that the voter identity cannot vote again in this election.

---

## 3. Ballot Privacy Disclosure

> [!WARNING]
> **Plaintext Candidate Calldata Transparency**  
> In `IndianElection.sol`, candidate selection is passed as a parameter in `castVote(..., candidateId, ...)`.
> Consequently:
> * Anyone inspecting the blockchain transaction can see which candidate was chosen.
> * While identity is pseudonymous via the nullifier, ballot secrecy is **not mathematically sealed**.
> * True secret voting in future versions would require Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge (zk-SNARKs) or homomorphic tally encryption.
