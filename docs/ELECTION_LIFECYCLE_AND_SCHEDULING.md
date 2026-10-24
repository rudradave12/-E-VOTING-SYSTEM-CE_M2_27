# BlockBallot — Election Lifecycle, Candidate Management & Server-Authoritative Timers

**Phase:** Phase 07 — Election Lifecycle, Candidate Management & Server-Authoritative Timers  
**Branch:** `feature/simulation-voter-registry-rbac`  
**Base Commit:** `4c50811` (Phase 06 Completion)  
**Standard Status:** Production-Grade Server-Authoritative Scheduling, Immutable Nominations & ECI Electoral Integrity  

---

## 1. Executive Summary & Design Principles

In democratic electronic voting, the boundary between eligibility and ineligibility is defined by time and administrative authority. BlockBallot Phase 07 establishes an authoritative, deterministic lifecycle engine that governs election states, candidate nominations, and voting window enforcement.

Prior to Phase 07, election statuses relied partly on static mocks, client-reported timestamps, or loose status strings. Phase 07 replaces these heuristics with a **server-authoritative finite state machine** and **UTC-grounded scheduling reconciliation** that cannot be spoofed, bypassed, or desynchronized by client devices.

```
       ┌──────────┐
       │  DRAFT   │
       └────┬─────┘
            │
            ▼
      ┌───────────┐       (Reconciliation / Manual Open)
      │ SCHEDULED │───────────────────────────────┐
      └─────┬─────┘                               │
            │                                     │
            ▼                                     ▼
      ┌───────────┐    Pause     ┌──────────┐    │
      │   OPEN    │◄────────────►│  PAUSED  │    │
      └─────┬─────┘    Resume    └────┬─────┘    │
            │                         │          │
            ├─────────────────────────┼──────────┘
            │                         │
            ▼                         ▼
      ┌───────────┐             ┌───────────┐
      │  CLOSED   │             │ CANCELLED │
      │(Terminal) │             │(Terminal) │
      └───────────┘             └───────────┘
```

### Key Architectural Principles:

1. **Strict Server Authority Over Timers:**
   - All election scheduling windows are recorded as **UTC epoch seconds** (`startTime`, `endTime`).
   - Browser or client-provided timestamps (`Date.now()`, system clocks) are **strictly ignored** during authorization and ballot casting.
   - Only the server's authoritative clock determines whether the voting window has opened or closed.

2. **Idempotent Schedule Reconciliation:**
   - The reconciliation engine (`reconcileElectionSchedules`) evaluates pending elections against current server time.
   - It transitions `SCHEDULED` elections to `OPEN` once `currentTimeSec >= startTime`, and `OPEN` (or `SCHEDULED`) elections to `CLOSED` once `currentTimeSec >= endTime`.
   - Operations are strictly idempotent: multiple reconciliation runs produce no redundant transitions or duplicate audit entries.

3. **Nomination Immutability & Anti-Tampering Locks:**
   - Candidates can be added, updated, or removed freely while an election is in pre-voting state (`DRAFT` or `SCHEDULED`) and no votes have been recorded.
   - The instant an election transitions to `OPEN` (or once any ballot is recorded, `voteCount > 0`), candidate details (name, party, symbol, constituency) are **locked permanently**.
   - Attempted edits or deletions against locked candidates fail closed with `HTTP 403 Forbidden`.
   - Withdrawals and disqualifications can still be processed via formal administrative deactivation (`PATCH /candidates/:id/deactivate`), recording the audit rationale without modifying historical ballots.

4. **Multi-Election Per-Elector Participation Isolation:**
   - Elector participation is tracked per `(voterId, electionId)` pair in `repos.participations`.
   - An elector casting a ballot in Election A (e.g., General Parliamentary Election) remains fully eligible to authorize and vote in Election B (e.g., Regional By-Election), provided they are eligible in both.
   - Double-voting within the same election is strictly rejected with `HTTP 409 Conflict`.

5. **Deterministic Injectable Simulated Clock for Verification:**
   - For automated CI/CD and integration testing, `serverStore` exposes an injectable simulated clock (`setSimulatedServerTime`, `advanceSimulatedServerTime`, `resetSimulatedServerTime`).
   - Tests execute instantly and deterministically across time transitions without requiring real wall-clock delays or flaky sleeps.

---

## 2. Election Lifecycle State Machine

### Supported States

BlockBallot supports 6 normalized uppercase statuses while maintaining full backwards compatibility with legacy lowercase representations:

| Normalized Status (`NormalizedElectionStatus`) | Legacy Status (`ElectionStatus`) | Classification | Description |
|---|---|---|---|
| `DRAFT` | `draft` | Pre-voting | Election configuration under preparation; constituencies and candidates being assigned. |
| `SCHEDULED` | `scheduled` | Pre-voting | Timetable locked with authoritative start and end times; awaiting start time. |
| `OPEN` | `active` | Active | Polls are open; authorized electors may submit ballots. |
| `PAUSED` | `paused` | Suspended | Temporarily halted by authorized Election Officer (e.g., emergency, recount). Voting blocked. |
| `CLOSED` | `concluded` | Terminal | Polls closed; voting window expired or ended early by officer. Final tallies locked. |
| `CANCELLED` | `cancelled` | Terminal | Election invalidated by Election Commission with mandatory recorded reason. Permanent lock. |

### Allowed State Transition Matrix

The lifecycle enforces the following strict transition rules (`ALLOWED_ELECTION_TRANSITIONS`):

| From State | Permitted Destination States | Prohibited Transitions (Fail Closed with `HTTP 400`) |
|---|---|---|
| `DRAFT` | `SCHEDULED`, `CANCELLED` | `OPEN`, `PAUSED`, `CLOSED` |
| `SCHEDULED` | `OPEN`, `CANCELLED` | `DRAFT`, `PAUSED`, `CLOSED` |
| `OPEN` | `PAUSED`, `CLOSED`, `CANCELLED` | `DRAFT`, `SCHEDULED` |
| `PAUSED` | `OPEN`, `CLOSED`, `CANCELLED` | `DRAFT`, `SCHEDULED` |
| `CLOSED` | *None (Terminal)* | All transitions rejected |
| `CANCELLED` | *None (Terminal)* | All transitions rejected |

### Transition Invariants & Guardrails:

- **Schedule Validity:** Transitions to `SCHEDULED` require `endTime > startTime`. Invalid schedules (`endTime <= startTime`) are rejected with `HTTP 400 Bad Request`.
- **Terminal Irreversibility:** Once an election is `CLOSED` or `CANCELLED`, no further transitions are permitted under any circumstances.
- **Mandatory Cancellation Reason:** Transitioning to `CANCELLED` requires a non-empty `cancellationReason` (string with meaningful justification). The server attributes the cancellation to the acting officer (`cancelledByOfficerId`, `cancelledAt`).
- **Separation of Terminal Paths:** An election that was concluded normally (`CLOSED`) cannot be marked `CANCELLED`, and a cancelled election cannot be revived into `CLOSED` or `OPEN`.

---

## 3. Server-Authoritative Scheduling & Reconciliation

### Time Model & UTC Seconds

Electoral schedules must remain unambiguous regardless of daylight saving adjustments, leap seconds, or regional client clocks. BlockBallot stores all start and end timestamps as integer **UTC seconds since Unix epoch**:

```typescript
export interface Election {
  id: string;
  numericId: number;
  title: string;
  description: string;
  status: ElectionStatus;
  startTime: number; // UTC seconds
  endTime: number;   // UTC seconds
  timezone?: string; // e.g., 'Asia/Kolkata' (default for Indian elections)
  constituencyIds: string[];
  totalVoters: number;
  totalVotesCast: number;
  cancellationReason?: string;
  cancelledAt?: number;
  cancelledByOfficerId?: string;
  publishedAt?: number;
  openedAt?: number;
  closedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}
```

### Timezone Presentation: Indian Standard Time (`Asia/Kolkata`)

While storage is strictly UTC, the user interface and administrative tooling display timestamps in **Indian Standard Time (IST, UTC+05:30)** by default, matching Election Commission of India (ECI) standards. Administrators can also view schedules in UTC or local browser time via the UI selector.

### Reconciliation Mechanism (`reconcileElectionSchedules`)

Reconciliation synchronizes election states with the passing of authoritative time:

```typescript
// server/store.ts
reconcileElectionSchedules(nowSec?: number): {
  transitions: Array<{ electionId: string; from: ElectionStatus; to: ElectionStatus; reason: string }>;
}
```

#### Trigger Points:
1. **Critical Voter Gateway Invocations:** Automatically triggered whenever an elector requests vote authorization (`POST /api/voter/authorization`) or submits a ballot (`POST /api/voter/record-vote`). This guarantees that an expired election closes instantly before any ballot is processed.
2. **Scheduled Engine Intervals:** Invoked periodically by the server background loop.
3. **Manual Operational Endpoint:** Accessible to authorized Election Officers via `POST /api/admin/elections/reconcile` for administrative verification.

#### Reconciliation Rules:
- If `status === 'scheduled'` and `nowSec >= startTime`:
  - If `nowSec >= endTime`: Transition directly to `concluded` (`CLOSED`).
  - Else: Transition to `active` (`OPEN`), recording `openedAt`.
- If `status === 'active'` and `nowSec >= endTime`:
  - Transition to `concluded` (`CLOSED`), recording `closedAt`.
- **Idempotency Guarantee:** If no elections qualify for transition, the returned `transitions` array is empty, and zero Firestore write or audit events are generated.

---

## 4. Candidate Management & State Locking

### Nomination Lifecycle

```
    [Draft / Scheduled Election]
               │
               ▼
   [Add / Update / Delete Candidate]  ◄── Allowed (voteCount === 0)
               │
      [Election Opens (OPEN)]
               │
               ▼
   [NOMINATION IMMUTABILITY LOCK]     ◄── Permanent Freeze
               │
               ├──────────────────────────────────────────┐
               ▼                                          ▼
   [Edit Candidate Info: 403 Forbidden]    [Delete Candidate: 403 Forbidden]
               │
               ▼
   [Formal Administrative Deactivation] (WITHDRAWN / DISQUALIFIED)
               │
               ▼
    [Audited Rationale Preserved; Historical Ballots Intact]
```

### Candidate Schema Enhancements

```typescript
export type CandidateStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED';

export interface Candidate {
  id: string;
  numericId: number;
  name: string;
  party: string;
  partySymbol: string;
  constituencyId: string;
  electionId?: string;
  status?: CandidateStatus;
  deactivatedAt?: number;
  deactivatedReason?: string;
  voteCount: number;
  createdAt?: number;
  updatedAt?: number;
}
```

### Locking Rules (`isCandidateLocked`)

A candidate nomination is considered **locked** if:
1. The candidate's `voteCount > 0` (even if the election is paused or rescheduled).
2. The associated election has transitioned to `OPEN` (`active`), `PAUSED` (`paused`), `CLOSED` (`concluded`), or `CANCELLED` (`cancelled`).

*Note on Academic Demo Isolation:* The baseline demonstration election `GE-2024` is pre-seeded in `active` status for UI walkthroughs. The candidate locking logic explicitly isolates `GE-2024` from globally locking candidate management across custom administrative elections created during testing or live drills.

### Administrative Endpoints & Responses:

| Action | Endpoint | Pre-Voting State | Open / Voted State |
|---|---|---|---|
| Create Candidate | `POST /api/admin/candidates` | `HTTP 201 Created` | `HTTP 403 Forbidden` (if election is open) |
| Update Candidate | `PATCH /api/admin/candidates/:id` | `HTTP 200 OK` | `HTTP 403 Forbidden` (`CANDIDATE_LOCKED`) |
| Delete Candidate | `DELETE /api/admin/candidates/:id` | `HTTP 200 OK` | `HTTP 403 Forbidden` (`CANDIDATE_LOCKED`) |
| Withdraw / Deactivate | `PATCH /api/admin/candidates/:id/deactivate` | `HTTP 200 OK` | `HTTP 200 OK` (Sets `status: 'WITHDRAWN'` with mandatory reason) |

---

## 5. Voting Gateway Integration & Multi-Election Model

### Authorization Gateway (`POST /api/voter/authorization`)

When a voter requests an EIP-712 blind-signature ticket to authorize casting a vote:

1. **Schedule Reconciliation:** Authoritative server clock evaluates current election timing.
2. **Authoritative Status Verification:**
   - If election is in `DRAFT` or `SCHEDULED` and `nowSec < startTime`: Fails closed with `HTTP 403 Forbidden` (`code: 'ELECTION_NOT_STARTED'`).
   - If election is in `CLOSED` or `nowSec >= endTime`: Fails closed with `HTTP 403 Forbidden` (`code: 'ELECTION_CONCLUDED'`).
   - If election is in `PAUSED` or `CANCELLED`: Fails closed with `HTTP 403 Forbidden` (`code: 'ELECTION_NOT_ACTIVE'`).
3. **Multi-Election Participation Check:**
   - Checks `repos.participations.findByVoterAndElection(voterId, electionId)`.
   - If elector has already finalized a ballot in **this** election (`status === 'VOTE_ACCEPTED'` or `status === 'VOTED'`), fails closed with `HTTP 409 Conflict`.
   - Participation in other elections does **not** impede eligibility for the target election.

### Ballot Recording Gateway (`POST /api/voter/record-vote`)

When an on-chain transaction hash is submitted to record voter participation:

1. **Lifecycle Gate:** Re-verifies authoritative election state (`OPEN`).
2. **Duplicate Vote vs. Idempotent Replay Handling:**
   - If participation already exists for `(voterId, electionId)`:
     - **Exact Match (`existing.txHash === newTxHash`):** Replay detected; returns `HTTP 200 OK` with existing record (idempotent retry).
     - **Mismatched Tx (`existing.txHash !== newTxHash`):** Attempted double-voting; fails closed with `HTTP 409 Conflict` (`code: 'DUPLICATE_VOTE'`).
3. **State Finalization:**
   - Records participation status as `VOTE_ACCEPTED`.
   - Increments candidate and constituency tallies.
   - Emits structured audit log for immutable traceability.

---

## 6. Role-Based Access Control (RBAC) & Scope Enforcement

All administrative lifecycle and candidate management operations require authenticated officer sessions verified against RBAC permissions and constituency boundaries:

### Permissions Matrix

| Operation | Required Permission | Allowed Roles |
|---|---|---|
| Create Election | `ELECTION_CREATE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Edit Draft / Scheduled Election | `ELECTION_UPDATE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Schedule Election | `ELECTION_UPDATE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Open Election Early | `ELECTION_ACTIVATE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Pause Election | `ELECTION_PAUSE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Resume Election | `ELECTION_ACTIVATE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Conclude Election Early | `ELECTION_CONCLUDE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Cancel Election | `ELECTION_UPDATE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Reconcile Schedules | Any Admin Session | `PLATFORM_ADMIN`, `ELECTION_OFFICER`, `VOTER_REGISTRATION_OFFICER` |
| Add Candidate | `CANDIDATE_MANAGE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Edit Candidate | `CANDIDATE_MANAGE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Delete Candidate | `CANDIDATE_MANAGE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |
| Deactivate Candidate | `CANDIDATE_MANAGE` | `PLATFORM_ADMIN`, `ELECTION_OFFICER` |

### Scope Enforcement

- **Constituency Scope Rules:**
  - `PLATFORM_ADMIN` has global jurisdiction (`assignedConstituencyIds: ['*']`).
  - `ELECTION_OFFICER` with restricted scope (e.g., `CONST-01-ND`) can only create elections, schedule elections, or manage candidates for constituencies within their explicit jurisdiction.
  - Attempting to target out-of-scope constituencies returns `HTTP 403 Forbidden` (`JURISDICTION_MISMATCH`).
- **Voter Registration Officers (VRO):**
  - VROs possess zero election management or candidate management permissions.
  - Attempting to create an election or add a candidate as a VRO fails closed with `HTTP 403 Forbidden`.

---

## 7. Frontend Election Administration

### Election Management Screen (`AdminElectionsScreen.tsx`)

1. **Server-Authoritative Informational Countdown:**
   - Displays time remaining until start (for `SCHEDULED` elections) or time remaining until closure (for `OPEN` elections).
   - Prominently displays the advisory note: *"Display only. Official election status is determined exclusively by server-authoritative timestamps."*
2. **Timezone Support:**
   - Displays dates and times in Indian Standard Time (IST, UTC+05:30) as official default.
   - Allows switching between IST, UTC, and Local Browser time for multi-regional administrative clarity.
3. **Comprehensive Action Confirmation Modals:**
   - **Open Early Modal:** Confirms immediate activation prior to scheduled start.
   - **Pause Modal:** Warns that voting will be immediately blocked for all electors.
   - **Resume Modal:** Re-enables voting for electors.
   - **Conclude Early Modal:** Explains that early closure is terminal and irreversible.
   - **Cancel Modal:** Requires an explicit, non-empty **Cancellation Reason** before allowing submission.
   - **Edit Election Modal:** Allows updating title, description, and timetable for draft or scheduled elections.
4. **Manual Timer Reconciliation:**
   - Features a dedicated **"Reconcile Timers"** button that synchronizes state with the server and displays a success banner detailing any automatic status transitions.

### Candidate Management Screen (`AdminCandidatesScreen.tsx`)

1. **Nomination Lock Warning Banners:**
   - When an election is open or votes have been cast, candidate action rows clearly indicate locked status with lock icons and explanatory text.
2. **Status Badges:**
   - Displays clear visual indicators for `ACTIVE`, `WITHDRAWN`, and `DISQUALIFIED` candidates.
3. **Action Dialogs:**
   - **Edit Candidate Modal:** Pre-voting edit of candidate name, party, and symbol.
   - **Delete Candidate Modal:** Pre-voting permanent removal.
   - **Withdraw Candidate Modal:** Post-opening formal withdrawal requiring mandatory reason and officer confirmation.

---

## 8. Test Suite & Verification Matrix

The test suite in [`src/test/phase07_election_lifecycle.test.ts`](file:///e:/Projects/BlockBallot-EVoting-System/src/test/phase07_election_lifecycle.test.ts) provides exhaustive end-to-end verification across 16 formal scenarios:

| Scenario | Objective | Validation Criteria | Result |
|---|---|---|---|
| **1** | Draft election creation | Authorized Election Officer creates draft election; saved with UTC timestamps. | **PASS** |
| **2** | VRO role rejection | Voter Registration Officer cannot create election (`HTTP 403 Forbidden`). | **PASS** |
| **3** | Jurisdiction scope | Election Officer cannot create election outside assigned constituencies. | **PASS** |
| **4** | Schedule & transition validation | Invalid schedules (`end <= start`) and illegal transitions (`DRAFT` -> `OPEN`) rejected. | **PASS** |
| **5** | Automatic opening | `reconcileElectionSchedules` transitions `SCHEDULED` to `OPEN` when `now >= start`. | **PASS** |
| **6** | Automatic closing | `reconcileElectionSchedules` transitions `OPEN` to `CLOSED` when `now >= end`. | **PASS** |
| **7** | Idempotent reconciliation | Repeated scheduler passes produce zero redundant transitions. | **PASS** |
| **8** | Pre-opening rejection | `/authorization` fails closed with `403` if `now < startTime`. | **PASS** |
| **9** | Open voting window | Authorized elector within window receives ticket and records ballot. | **PASS** |
| **10** | Closed/cancelled rejection | `/authorization` and `/record-vote` fail closed on `CLOSED` or `CANCELLED`. | **PASS** |
| **11** | Anti-clock-spoofing | Spoofed client headers or browser clocks cannot bypass server schedule. | **PASS** |
| **12** | Candidate nomination locks | Candidates editable in draft; locked once election opens or votes exist. | **PASS** |
| **13** | Ballot & tally preservation | Candidate tallies and cast ballots remain intact through lifecycle changes. | **PASS** |
| **14** | Multi-election participation | Elector voting in Election A remains eligible to vote in Election B. | **PASS** |
| **15** | Phase 06 exception integrity | Manual physical-ID exceptions remain single-use and bound to target election. | **PASS** |
| **16** | State transition matrix | Matrix comprehensively validates all valid paths and rejects all invalid paths. | **PASS** |

---

## 9. Security Summary & Operational Invariants

1. **Zero Client Clock Reliance:** Client devices cannot influence voting windows; reconciliation evaluates strictly against server time.
2. **Terminal State Immutability:** Once marked `CLOSED` or `CANCELLED`, an election can never be reopened or manipulated.
3. **Double-Voting Prevention (409 Conflict):** Submitting duplicate votes with differing transaction hashes is blocked at the gateway level.
4. **Separation of Duties:** Candidate withdrawals require mandatory reasons and officer attribution, preserving complete auditable lineage for post-election electoral review.
