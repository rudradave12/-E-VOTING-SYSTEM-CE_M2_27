# BlockBallot — Academic Demonstration Checklist & Presentation Guide

> [!NOTE]
> **University Evaluation & Demonstration Runbook**  
> Use this checklist to conduct a live, repeatable academic demonstration of the BlockBallot e-voting prototype.

---

## 1. Pre-Demo Setup Verification

- [ ] Node.js ($\ge 20.x$) installed and verified (`node --version`).
- [ ] Dependencies cleanly installed (`npm ci`).
- [ ] Terminal 1: Hardhat local node running (`npm run node:start`) on `127.0.0.1:8545`.
- [ ] Terminal 2: Contract deployed (`npm run contract:deploy`).
- [ ] Terminal 2: Application server running (`npm run dev`) on `http://127.0.0.1:3000`.
- [ ] Browser window open to [http://127.0.0.1:3000](http://127.0.0.1:3000).

---

## 2. Demonstration Flow: Step-by-Step

### Phase 1: Portal Overview & Public Information
1. **Home Page**: Show that the landing page answers the 4 core voter questions:
   * How do I log in?
   * Which elections are available?
   * How do I cast a ballot?
   * How do I get confirmation?
2. **Top Navigation**: Point out the clean 4-item public navigation (**Home**, **Vote / Available Elections**, **How Voting Works**, **Voter Login**) and the separate **Officer Login** portal.
3. **Academic Disclaimer**: Highlight the truthful disclaimer in the footer confirming that this is a research prototype not affiliated with ECI/UIDAI.

### Phase 2: Scenario A — Seeded 2024 Demo Election
1. Click **Vote / Available Elections**.
2. Point out **Scenario A: 18th Lok Sabha 2024 (Academic Demo Election)**:
   * Status is **ACTIVE**.
   * Researched candidates and official party symbols (Lotus, Hand, Broom, NOTA) for New Delhi, Varanasi, Wayanad, and Bangalore South.
   * **Key Verification**: The ballot counter starts at **zero (0)** test votes.
   * Show that official 2024 historical archives (over 800,000 votes in New Delhi) remain completely separate and immutable.

### Phase 3: The Voter Experience (Happy Path)
1. Navigate to **Voter Login** (or click **Enter Voting Booth**).
2. Enter synthetic EPIC ID: `IND-DL-982341` (Rajesh Kumar Sharma, New Delhi).
3. Click **Proceed to Verification**:
   * Show masked mobile: `+91 ••••• •4589`.
   * Note the synthetic test delivery OTP displayed on screen (e.g. `123456`).
4. Enter the 6-digit OTP and click **Verify & Authenticate**:
   * Session is established with 15-minute expiry.
5. In **Select Candidate**:
   * Show candidates for New Delhi (Constituency #4).
   * Select a candidate (e.g., *Somnath Bharti - Aam Aadmi Party*).
6. Click **Proceed to Review**:
   * Confirm the selection.
7. In **Wallet Authorization**:
   * Keep default **Academic Testnet Signer**.
   * Note the explicit privacy disclosure regarding plaintext transaction calldata.
8. Click **Confirm & Cast Ballot On Blockchain**:
   * Backend issues an EIP-712 typed signature ticket.
   * Smart contract verifies ticket, checks `msg.sender == voterWallet`, and burns the nullifier.
9. In **Receipt Screen**:
   * Inspect the transaction hash (e.g., `0x...`), block number, and nullifier.

### Phase 4: Security Verification (Duplicate Vote Rejection)
1. Without clearing session, attempt to vote again or re-enter EPIC `IND-DL-982341`.
2. Notice the immediate rejection:
   * *Status: VOTED. This elector record has already completed an authorized vote.*
   * Even if an attacker re-submitted the same ticket directly to the blockchain, the contract reverts: `BlockBallot: Nullifier already spent`.

### Phase 5: Scenario B — Administrator Election Management
1. Click **Officer Login** in the navigation header.
2. Log in using the Returning Officer credentials.
3. In **Election Scheduling**:
   * Show how an officer creates a new election with title, election type, and constituency enrollment.
   * Demonstrate setting explicit start and closing deadlines.
   * Show the state transition buttons: `Draft` $\rightarrow$ `Scheduled` $\rightarrow$ `Active` $\rightarrow$ `Paused` $\rightarrow$ `Concluded`.
4. In **Audit Logs**:
   * View the tamper-evident audit log showing the vote just cast, verifying that the candidate selection was **never recorded in audit logs**.

### Phase 6: Independent Party-Preference Poll
1. Navigate to the footer link **Party-Preference Poll**.
2. Show that this is an unofficial research poll completely independent of election ballots.
3. Submit a preference and show the real-time aggregate bar chart.

---

## 3. Academic Discussion Points for Examiners

* **Double-Voting Prevention**: How EIP-712 tickets and on-chain nullifier sets solve Sybil and replay attacks without storing personal voter IDs on the public blockchain.
* **Separation of Concerns**: Why historical reference data, active demo ballots, administrator-created elections, and preference polls reside in distinct data boundaries.
* **Ballot Privacy Trade-Off**: Why the prototype exposes candidate IDs in calldata (for pedagogical clarity) and how zero-knowledge SNARKs (e.g., MACI or Semaphore) would be applied in production.
