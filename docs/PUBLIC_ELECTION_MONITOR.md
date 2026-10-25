# BlockBallot — Public Election Monitor Dashboard (Phase 11)

## 1. Overview and Architecture

The **BlockBallot Public Election Monitor Dashboard** (`ElectionMonitorScreen.tsx`) provides transparent, privacy-preserving oversight of demonstration and simulation elections. Designed for public visitors, observers, and voters, it exposes authoritative lifecycle schedules, aggregate voter turnout statistics, and certified election results without compromising individual ballot secrecy or system security.

### Core Architecture Principles

1. **Distinction of Election Data**:
   - **Active Simulation Elections**: Live demonstration elections executing on the local EVM testnet or simulated EVM state (e.g., `GE-2024`).
   - **Scheduled Simulation Elections**: Future demonstration elections waiting for their opening timestamp.
   - **Concluded Simulation Elections**: Sealed historical trials (e.g., `DEMO-PREV-2023`) whose ballots have concluded.
   - **Verified Historical Archive (Phase 10)**: Real, authoritative Form 20 Gazette returns from past Indian elections (e.g., the 2024 Lok Sabha General Election), completely isolated from active voting.
   - **Unavailable Statistics**: Any metric without a verified numerator or denominator is explicitly labeled `Unavailable` rather than fabricated.

2. **Strict Public Projection Model**:
   - Public monitor endpoints never expose raw internal databases, voter profiles, biometric metadata, officer notes, or session tokens.
   - Private `DRAFT` elections are strictly hidden from public endpoints until officially scheduled or published.

---

## 2. Metric Audit Table

The following table documents every metric displayed on the Public Election Monitor, its authoritative source of truth, calculation method, freshness behavior, and privacy classification:

| Metric Name | Authoritative Source | Calculation / Derivation | Freshness Behavior | Privacy Classification |
|---|---|---|---|---|
| **Tracked Public Elections** | `serverStore.getAllElections()` | Count of elections where `normalizeElectionStatus(status) !== 'DRAFT'` | Reconciled against server clock on each query | Public metadata |
| **Open Elections Count** | `serverStore.getAllElections()` | Count where `normalizedStatus === 'OPEN'` | Reconciled against server clock on each query | Public metadata |
| **Scheduled Elections Count** | `serverStore.getAllElections()` | Count where `normalizedStatus === 'SCHEDULED'` | Reconciled against server clock on each query | Public metadata |
| **Closed Elections Count** | `serverStore.getAllElections()` | Count where `normalizedStatus === 'CLOSED'` | Reconciled against server clock on each query | Public metadata |
| **Authoritative Start / End Time** | `election.startTime`, `election.endTime` | Stored Unix timestamps in seconds | Immutable per election record | Public metadata |
| **Countdown to Transition** | `serverStore.getCurrentTimeSec()` vs `startTime` / `endTime` | `Math.max(0, targetTime - serverTimeSec)` | Synchronized with server clock; client timer is informational | Public metadata |
| **Confirmed Participating Voters** | `repos.participations.listByElection(id)` | Count of unique voter participation records where `status === 'VOTE_ACCEPTED'` | Updated atomically upon ballot confirmation | Public aggregate (no voter linkage) |
| **Eligible Voter Denominator** | `serverStore.getAllConstituencies()` | Sum of `totalElectors` across the election's assigned constituencies | Stored registry count | Public aggregate |
| **Simulated Turnout Percentage** | Confirmed Voters & Denominator | `(confirmedVoters / eligibleDenominator) * 100` (or `Unavailable` if denominator is 0) | Recomputed on request | Public aggregate |
| **Constituency Turnout Breakdown** | Per-constituency turnout & electors | Per-constituency confirmed votes and electors | Recomputed on request | Masked if electors &le; 5 (K-Anonymity) |
| **Candidate Tallies (Active)** | Smart contract / Candidate records | **STRICTLY SEALED** (`resultsAvailable: false`) | Locked during voting | **CRITICAL BALLOT PRIVACY INVARIANT** |
| **Candidate Results (Concluded)** | `serverStore.getAllCandidates()` | Filtered by constituency, sorted by `voteCount`, percentage computed | Available ONLY after election is `CLOSED` | Public certified summary |
| **Data Freshness / Stale Warning** | HTTP poll timestamp | Age since last successful server sync; flagged stale on network error | 20s polling interval; instant tab-focus revalidation | Operational diagnostic |

---

## 3. Critical Ballot Secrecy Architecture & Phase 09 Blocker

### Technical Privacy Invariant

Phase 09 identified and documented a fundamental cryptographic limitation in `contracts/IndianElection.sol`:
```solidity
function castVote(
    uint256 _electionId,
    uint256 _constituencyId,
    uint256 _candidateId,
    bytes32 _nullifier,
    bytes calldata _signature
) external;
```
Because `_candidateId` is passed in plaintext calldata and emitted in public `VoteCast` events, any observer inspecting the transaction payload on a public EVM explorer can infer the candidate selected.

### Dashboard Safeguards

1. **Sealed Ballots During Voting**:
   - The public monitor strictly refuses to publish live candidate-by-candidate tallies while an election is `OPEN`, `SCHEDULED`, or `PAUSED`.
   - The endpoint `GET /api/monitor/elections/:id/results` returns:
     ```json
     {
       "resultsAvailable": false,
       "reason": "Candidate-level counts are sealed while the election is active, scheduled, or paused..."
     }
     ```
2. **Honest Architectural Disclosure**:
   - The dashboard prominently displays the `BALLOT_SECRECY_LIMITATION_NOTICE` on every screen:
     > *"CRITICAL PRIVACY NOTICE: In the current EVM smart contract implementation (IndianElection.sol), candidate selection is transmitted in plaintext transaction calldata and emitted in public VoteCast events. Public blockchain transparency does not equate to cryptographic ballot secrecy. This public monitor strictly seals candidate-level counts while voting is in progress, but cannot resolve the underlying on-chain privacy limitation. Production deployments require zero-knowledge proofs (ZKP) or homomorphic tally encryption."*
3. **No Voter-to-Candidate Association**:
   - Public APIs never link a voter's EPIC, simulation ID, or wallet address to their candidate choice.

---

## 4. Turnout and Statistical Integrity

To prevent misleading or inflated numbers:
- **No Duplicate Votes**: Participation counts use unique voter IDs from terminal `VOTE_ACCEPTED` records. Identical transaction replays or duplicate queries do not increment participation.
- **No Pending Votes**: Expired sessions, failed blockchain transactions, or abandoned OTP challenges are strictly excluded from participation counts.
- **Safe Denominator Handling**: If the eligible-voter denominator is zero or missing, the monitor reports `turnoutStatus: 'ZERO_DENOMINATOR'` and displays `Unavailable` instead of dividing by zero or assuming 100%.
- **K-Anonymity Protection**: If a constituency has 5 or fewer registered electors, its turnout breakdown is masked (`privacyMasked: true`) to prevent reverse-engineering individual voter actions.

---

## 5. REST API Specifications

All endpoints are mounted under `/api/monitor`:

### `GET /api/monitor/overview`
Returns high-level counts and the authoritative server clock.
```json
{
  "success": true,
  "overview": {
    "totalPublicElections": 2,
    "openElectionsCount": 1,
    "scheduledElectionsCount": 0,
    "closedElectionsCount": 1,
    "pausedElectionsCount": 0,
    "cancelledElectionsCount": 0,
    "serverTimeSec": 1740000000,
    "serverTimeIso": "2026-10-25T14:15:00.000Z",
    "disclaimer": "ACADEMIC PROTOTYPE NOTICE...",
    "ballotSecrecyLimitationNotice": "CRITICAL PRIVACY NOTICE..."
  }
}
```

### `GET /api/monitor/elections`
Searchable and filterable election catalog (excluding `DRAFT` status).
- **Query Parameters**:
  - `status`: Filter by normalized status (`OPEN`, `SCHEDULED`, `CLOSED`, `PAUSED`, `CANCELLED`).
  - `state`: Filter by constituency state.
  - `type`: Filter by election type string.
  - `q`: Free-text search matching title, description, or constituency name.
  - `page`: Page number (default: 1).
  - `limit`: Records per page (default: 10, max: 50).

### `GET /api/monitor/elections/:id`
Retrieves public detail for an election, including constituency metadata and countdown windows.
- Returns `404 Not Found` if the election does not exist or is in `DRAFT` status.

### `GET /api/monitor/elections/:id/participation`
Retrieves privacy-safe aggregate participation metrics.
- Excludes candidate choices and voter identities.
- Implements k-anonymity masking for low elector pools (&le; 5 electors).

### `GET /api/monitor/elections/:id/results`
Retrieves certified candidate-level results.
- **Gated**: If the election is `OPEN`, `SCHEDULED`, or `PAUSED`, returns `resultsAvailable: false`.
- If `CLOSED` and certified, returns candidate tallies, vote share percentages, and winning candidate information.

---

## 6. Live Refresh & Visibility Management

The client implements background revalidation using browser visibility events:
- **Active Tab**: Polls the server every 20 seconds for authoritative schedule transitions and turnout updates.
- **Inactive / Hidden Tab**: Background polling is automatically paused when `document.visibilityState === 'hidden'` to preserve client and server resources.
- **Tab Focus Restoration**: When the user switches back to the monitor tab (`visibilitychange` event), an immediate background refresh is triggered.
- **Stale Data Warning**: If network requests fail, a prominent warning informs the user that displayed data may be stale, without fabricating live status changes.
- **Rate Limiting**: Public endpoints enforce an in-memory limit of 120 requests/minute per IP.

---

## 7. Security and Firestore Isolation

1. **Client Write Denials**:
   - `firestore.rules` strictly denies client writes to all election and archive collections:
     ```javascript
     match /public_election_summaries/{summaryId} {
       allow read: if isValidId(summaryId);
       allow list: if true;
       allow write: if false;
     }
     ```
2. **Server-Side Authorization**:
   - All lifecycle transitions are governed exclusively by server-side authoritative reconciliation (`serverStore.reconcileElectionSchedules()`).
   - Client clocks cannot open, pause, or close elections.
3. **No PII Leaks**:
   - Public projections completely omit voter names, EPIC IDs, phone numbers, Aadhaar tokens, officer notes, and private keys.

---

## 8. Unavailable Statistics & Future Cryptographic Upgrades

| Unavailable Statistic | Reason for Omission | Future Cryptographic Roadmap |
|---|---|---|
| **Real-time Live Candidate Counts** | Deliberately sealed to preserve voter autonomy and prevent vote-buying | Homomorphic ElGamal encryption or MACI tallying |
| **Individual Ballot Receipts on Monitor** | Omitted to prevent coercion and receipt-based vote selling | Verifiable shuffle with zero-knowledge proof of decryption |
| **Micro-Geographic Voter Heatmaps** | Low population densities reveal individual turnout | Differential privacy noise injection for sub-precinct reporting |
| **Real-time Network Gas Costs** | Irrelevant for academic simulation demonstrations | Layer-2 rollup gas estimation integration |
