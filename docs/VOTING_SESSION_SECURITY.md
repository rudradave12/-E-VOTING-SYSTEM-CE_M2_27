# BlockBallot — Phase 08: Voting Session Security, Ballot Authorization & Anti-Replay Protection

## 1. Executive Summary & Security Objectives

BlockBallot Phase 08 introduces server-authoritative voting session management, cryptographic ballot authorization, multi-layered anti-replay controls, fullscreen exit policy enforcement, and audited supervised session recovery. 

### Core Security Objectives:
1. **Server-Authoritative Sessions:** Bind elector credentials, election ID, constituency, and biometric/exception verification outcomes to high-entropy session tokens with server-side SHA-256 hashing.
2. **Strict Anti-Replay & Single-Vote Invariant:** Enforce that an elector can cast at most one accepted ballot per election across concurrent requests, duplicate submissions, and network retries, while preserving independent eligibility across different elections.
3. **Integrity-Preserving Candidate Validation:** Verify candidate membership in the specific election and constituency before permitting ballot recording.
4. **Authoritative Clock Enactment:** Prevent client clock manipulation from extending session validity or altering election lifecycle states.
5. **Session Lockout & Supervised Recovery:** Detect unexpected exits from the voting kiosk interface (fullscreen mode) with progressive warnings and a hard 3-exit lockout requiring jurisdictional officer recovery.
6. **Separation of Auditability and Vote Secrecy:** Maintain auditable, non-repudiable logs without logging candidate selections or raw biometric credentials.

---

## 2. Threat Model & Baseline Security Audit

This section documents the threat model and systematic audit conducted across the ten designated attack surfaces.

| # | Attack Surface | Threat Description | Implemented Mitigation | Residual Risk / Architecture Boundary |
|---|---|---|---|---|
| 1 | **Voter Identification & Eligibility** | An attacker injects synthetic or deactivated voter IDs, or attempts to obtain a voting session for an ineligible voter. | Authoritative server registry check verifies `simulationVoterId` format (`BBV-SIM-...`), active profile status (`ACTIVE`), and constituency assignment. Deactivated or unknown electors fail closed. | Requires trusted simulation voter registry in Firestore/memory. |
| 2 | **Voting Authorization & Session Creation** | Session fixation or forgery where an attacker manufactures a fake token or hijacks an existing token. | Sessions are generated server-side using 256-bit cryptographically secure randomness (`crypto.randomBytes(32)`). The raw token is delivered to the client; server persists the SHA-256 hash. | In-transit hijacking prevented when TLS/HTTPS is active. |
| 3 | **Biometric & Exception Paths** | An attacker claims a mock biometric preview or uses an enrollment-time exception to authorize a vote. | Server distinguishes genuine biometric verification outcomes from demo previews (`DEMO_PREVIEW_ONLY` rejected). Enrollment exceptions (`ENROLLMENT`) cannot authorize voting. Voting-time exceptions require distinct officer approval (`MANUAL_PHYSICAL_ID_APPROVED`), exact election binding, valid expiry, and single-use consumption. | Biometric feature matching in browser relies on simulation feature vectors; hardware biometric security requires certified biometric devices. |
| 4 | **Election Lifecycle & Server Time** | Client adjusts system clock to vote before an election opens or after it closes. | Client timestamps are ignored. The server clock (`serverStore.getCurrentTimeSec()`) is the sole authority for election schedules, ticket validity, and session expiry. | NTP sync drift on backend server host. |
| 5 | **Ballot Submission & Duplicate Transactions** | Rapid concurrent requests, repeated browser submissions, or replay of transaction hashes. | Concurrency-safe participation updates (`VoterElectionParticipation`). Spent nullifier registry checks. Replaying an identical transaction returns HTTP 200 OK (idempotent); attempting to submit a different ballot or second transaction returns HTTP 409 Conflict. | Distributed multi-region Firestore concurrency requires Firestore transaction locks. |
| 6 | **Firestore Transactions & Participation** | Direct client manipulation of participation status to bypass voting records. | Firestore security rules block direct client writes to `participations`, `elections`, and `auditEvents`. All updates must flow through authenticated backend Express endpoints. | Backend service account credential security. |
| 7 | **Smart-Contract Calldata & Public Events** | Public blockchain transparency exposing candidate selection and voter wallet addresses. | Contract audit conducted on `IndianElection.sol`. Discovered that `castVote` accepts plain `_candidateId` and emits `VoteCast` with candidate ID and voter wallet. Explicitly classified as an unresolved privacy blocker for Phase 09. | Public blockchain ledgers are pseudonymous, not anonymous. Zero-knowledge proof (ZKP) or homomorphic encryption required in Phase 09. |
| 8 | **Browser Navigation, Tabs & Clock Tampering** | Elector opens multiple tabs or modifies localStorage to revive expired sessions or vote twice. | Authoritative session state is validated on every backend operation. Once a vote is accepted or session expires, all tabs bound to that elector/session fail with HTTP 401/409. LocalStorage cannot override server session status. | Browser memory isolation between tabs is guaranteed by same-origin policy. |
| 9 | **Fullscreen Exit & Loss of Focus** | An elector or third party exits the kiosk environment, navigates away, or injects devtools scripts. | Fullscreen state changes are captured. 1st exit triggers a warning modal; 2nd exit triggers a final warning; 3rd exit triggers a hard server lock (`LOCKED_SUPERVISED_RECOVERY`). Refreshing does not clear the lock. | Browser fullscreen is NOT an operating-system kiosk lockdown. Physical terminal supervisor oversight is required. |
| 10 | **Error Messages, Logs & Audit Coverage** | Application logs or audit trails leaking voter choice, biometric templates, or session secrets. | Tokens are stored and compared by SHA-256 hash. Biometric templates and candidate choices are explicitly excluded from `AuditEvent` records and server logs. | Operational log forwarding sanitization. |

---

## 3. Important Blockchain Limitation: Candidate Disclosure Audit

### Audit of `contracts/IndianElection.sol`
A direct source audit of the Solidity smart contract [`contracts/IndianElection.sol`](../contracts/IndianElection.sol) was performed.

```solidity
// Line 220: Function signature
function castVote(
    uint256 _electionId,
    uint256 _constituencyId,
    uint256 _candidateId,
    bytes32 _nullifier,
    bytes calldata _authoritySignature
) external whenNotPaused { ... }

// Line 266: Emitted event
emit VoteCast(
    _electionId,
    _constituencyId,
    _candidateId,
    _nullifier,
    msg.sender
);
```

### Exact Findings:
1. **Public Transaction Calldata:** The `_candidateId` parameter is passed in plaintext in the calldata of the Ethereum transaction. Any node or block explorer inspecting the transaction payload can observe the exact candidate chosen.
2. **Public Event Logs:** The contract emits `VoteCast` with `_candidateId` and `msg.sender` (the voter's wallet address). This creates a direct on-chain association between the voter's public address and their political selection.
3. **No End-to-End Ballot Secrecy on Public Chains:** Hiding candidate names or selections in the React frontend does **not** provide secret-ballot privacy when transactions are recorded on a public blockchain.
4. **Hashing Candidate IDs is Ineffective:** Because the set of candidate IDs in any constituency is small (typically 2 to 20 candidates), replacing candidate IDs with simple hashes would allow trivial offline dictionary attacks / brute force to reveal votes.

### Phase 08 Architectural Position:
- **Vote Secrecy Blocker:** This limitation is officially classified as an unresolved privacy blocker for Phase 09 (Homomorphic Encryption / Zero-Knowledge Proofs).
- **Auditability vs. Privacy:** BlockBallot maintains auditability (proof that an authorized vote was cast and counted exactly once) while clearly disclosing that cryptographic ballot confidentiality on the blockchain requires the Phase 09 privacy architecture.

---

## 4. Server-Authoritative Voting Sessions

### Session Construction and Cryptographic Tokens
When an elector verifies their simulation credentials and one-time password (OTP), the server generates a cryptographically secure session record:
- **Session ID:** High-entropy identifier (e.g., `bb_vses_<hex>`).
- **Raw Token:** Delivered in the Authorization header to the browser client.
- **Token Hash:** SHA-256 hash of the token, persisted in `serverStore.sessionsByHash`.
- **Elector Binding:** Bound to `voterId`, `epicId`, `simulationVoterId`, and `constituencyId`.
- **Election Binding:** Bound to the specific `electionId` and `numericElectionId`.
- **Authentication Nonce:** Unique nonce regenerated per authorization attempt to prevent replay.
- **Timestamps:** Authoritative `createdAt` and `expiresAt` (default TTL: 900 seconds / 15 minutes).

### State Model & Legal Transitions
The voting session implements an explicit finite state machine:
```
           +-----------------------------+
           |           CREATED           |
           +-----------------------------+
                          |
                          v
+---------------------------------------------------+
|          IDENTITY_VERIFICATION_PENDING            |
+---------------------------------------------------+
       |                                     |
       v                                     v
+---------------+                   +-----------------+
|   AUTHORIZED  |<------------------|  MANUAL_APPR    |
+---------------+                   +-----------------+
       |         \
       |          \ (3 Fullscreen Exits)
       |           v
       |    +-----------------------------+
       |    |  LOCKED_SUPERVISED_RECOVERY |
       |    +-----------------------------+
       |                   | (Officer Recovery)
       |                   v
       |            +---------------+
       |----------->|   AUTHORIZED  |
       |            +---------------+
       |
       v
+-------------------------------+
|     SUBMISSION_IN_PROGRESS    |
+-------------------------------+
       |
       v
+-------------------------------+
|      SUBMISSION_CONFIRMED     |
+-------------------------------+
```

Any unauthorized jump between non-contiguous states (e.g. attempting to jump from `CREATED` directly to `SUBMISSION_CONFIRMED`) is rejected by `isValidVotingSessionTransition()`.

---

## 5. Session Lifecycle and Timeouts

1. **Configurable Server TTL:** The default voting session duration is set to 900 seconds (15 minutes).
2. **Authoritative Expiration:** The backend validates `session.expiresAt` against `serverStore.getCurrentTimeMs()` on every request. Client-side clock manipulation has zero effect on session validity.
3. **Session Invalidation Conditions:** A session is invalidated immediately if:
   - The session expires (`now > expiresAt`).
   - The voter profile is deactivated (`status !== 'ACTIVE'`).
   - The election status transitions to `CLOSED`, `PAUSED`, or `CANCELLED`.
   - The elector already has a participation record of `VOTE_ACCEPTED`.
   - The session has been revoked or locked for supervised recovery.

---

## 6. Ballot Submission & Anti-Replay Protection

### Concurrency and Duplicate Submission Controls
1. **Single Accepted Ballot per Election:**
   - Before accepting a ballot, `POST /api/voter/record-vote` queries the voter's participation record via `repos.participations.getParticipation(voterId, electionId)`.
   - If the elector has already cast an accepted ballot (`status === 'VOTE_ACCEPTED'`):
     - **Idempotent Retry:** If the incoming request supplies the **identical** transaction hash (`txHash === existing.txHash`), the endpoint returns `HTTP 200 OK` with the confirmed ballot metadata without double-counting.
     - **Duplicate Submission:** If the incoming request has a different or missing transaction hash, the endpoint immediately rejects with `HTTP 409 Conflict` (`DOUBLE_VOTE_ATTEMPT`).
2. **Multi-Election Independence:**
   - Participation records are partitioned by `(voterId, electionId)`. An elector who has voted in General Election `GE-2024` remains fully eligible to vote in Municipal Council Election `MUNI-2024` if registered in that jurisdiction.
3. **Nomination & Constituency Validation:**
   - The server validates that the selected candidate exists in the nominations registry, is currently `ACTIVE` (not withdrawn or disqualified), and is assigned to the elector's exact constituency (`validateCandidateInElectionAndConstituency`).
4. **Spent Nullifier Tracking:**
   - Spent nullifiers are stored in memory and persisted on-chain. Submitting a used nullifier returns an immediate rejection.
5. **Atomic Turnout and Tally:**
   - Candidate vote tally (`candidate.voteCount`) and constituency turnout (`constituency.turnoutCount`) are incremented only upon confirmed, non-duplicate ballot verification.

---

## 7. Fullscreen Exit Policy & Supervised Recovery

### Policy Specification
The voting client monitors unexpected losses of focus or exits from fullscreen mode:
1. **Exit #1:** First warning modal displayed. Explains electoral session protocol and prompts the elector to return to fullscreen.
2. **Exit #2:** Final warning modal displayed. Alerts the elector that a third exit will lock the terminal.
3. **Exit #3:** The client reports the threshold event to `POST /api/voter/session/fullscreen-exit`. The server transitions the session to `LOCKED_SUPERVISED_RECOVERY`, locks the participation status to `SESSION_LOCKED`, and records an audit event.

### Server-Enforced Persistence
- The session lock is stored in backend session memory and persisted across page reloads and multiple tabs.
- A client-side refresh or cache clear queries `GET /api/voter/session` and immediately renders the full-screen lockout overlay.

### Supervised Recovery Workflow
To unlock a locked terminal:
1. An authorized **Election Officer** (`ELECTION_OFFICER`) or **Platform Admin** (`PLATFORM_ADMIN`) must log in.
2. The officer enters an explicit administrative justification reason of at least 5 characters (e.g., *"Accidental kiosk focus loss; elector verified in person"*).
3. The server checks:
   - Officer role and jurisdiction scope (`isConstituencyInScope`, `isElectionInScope`).
   - That the session is currently in `LOCKED_SUPERVISED_RECOVERY`.
   - That the elector has not already voted (`status !== 'VOTE_ACCEPTED'`).
   - That the election remains `OPEN` and has not concluded.
4. Upon successful validation, the session transitions back to `AUTHORIZED`, the exit count is reset to 0, participation status is restored to `SESSION_AUTHORIZED`, and a structured `SUPERVISED_SESSION_RECOVERY` audit event is recorded.

### Physical Security Limitation:
> **Crucial Warning:** Browser fullscreen API (`requestFullscreen`) is **not** an operating system kiosk lockdown. Voters can still use OS keyboard shortcuts (`Alt+Tab`, `Cmd+Tab`, `Super key`), system notifications, or browser developer tools. True kiosk enforcement in production elections requires hardware lockdown (e.g., ChromeOS Kiosk Mode, Linux secure kiosk shell, or dedicated EVM hardware units).

---

## 8. Testable Security Invariants

The following 27 security invariants are empirically tested and verified in `src/test/phase08_voting_session_security.test.ts`:

1. Valid voter authorization creates a server-bound session with high-entropy token and SHA-256 hash.
2. Invalid, inactive, or unknown simulation voter IDs fail closed with HTTP 404/400.
3. Ineligible voters cannot obtain a voting session or ticket.
4. Non-open elections (DRAFT, SCHEDULED, PAUSED, CLOSED, CANCELLED) cannot initiate voting sessions.
5. Client clock manipulation cannot extend session validity or bypass election schedules.
6. A session bound to one voter or election cannot authorize another voter or election.
7. Expired or revoked session tokens cannot authorize voting.
8. Client-supplied role, voter ID, election state, or expiry overrides in request bodies are ignored.
9. Enrollment-time exception approvals cannot authorize voting sessions.
10. Voting-time physical-ID exceptions are bound to the exact active voter and election.
11. Expired, mismatched, revoked, or consumed exceptions fail closed.
12. A valid ballot is accepted only during an active election with an authorized session.
13. Duplicate submissions cannot produce two accepted ballots (HTTP 409 Conflict).
14. Concurrent ballot submissions cannot create multiple accepted votes for the same elector.
15. A replayed transaction does not increase the candidate tally twice (HTTP 200 idempotent response).
16. Transaction timeouts or network disconnects can be safely checked without granting duplicate votes.
17. An eligible elector may vote independently in two distinct active elections.
18. A deactivated elector or locked session cannot continue ballot submission.
19. First fullscreen exit generates warning #1.
20. Second fullscreen exit generates final warning #2.
21. Third fullscreen exit locks the session in `LOCKED_SUPERVISED_RECOVERY` and disables voting controls.
22. Refreshing the browser or opening another tab does not clear a server-recorded session lock.
23. Supervised recovery validates officer role, jurisdiction scope, session state, and election status.
24. Supervised recovery does not reopen a consumed voting opportunity or duplicate a cast ballot.
25. Phase 07 election lifecycle protections remain fully intact.
26. Phase 06 manual physical-ID exception expiry and one-time consumption remain fully intact.
27. Smart contract candidate disclosure in `IndianElection.sol` is documented and verified against the actual Solidity source.
