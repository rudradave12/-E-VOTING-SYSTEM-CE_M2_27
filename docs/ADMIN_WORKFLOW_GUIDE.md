# BlockBallot — Administrator Workflow & Lifecycle Guide

> [!NOTE]
> **Academic Returning Officer Portal**  
> This guide details how authorized election administrators configure election schedules, register candidates, manage electoral rolls, transition lifecycle states, and monitor real-time audit logs.

---

## 1. Officer Authentication (`AdminLoginScreen.tsx`)

* **Access Control**: Administrative routes require verified role-based authorization (`Returning Officer` or `Election Commissioner`).
* **Firebase Token Verification**: Handled via `POST /api/admin/login` using `firebase-admin` verifying cryptographic ID tokens.
* **Isolated Local Demo Administrator**:
  * Demo Email: `demo.admin@blockballot.local`
  * Seeding Script: `npm run admin:seed`
  * The password is automatically generated and stored exclusively in the gitignored `.env.local` file.
  * Verified server-side via `POST /api/admin/login` issuing a signed `adm_...` session token.
* **Fail-Closed Security**: In production (`NODE_ENV=production`), the demo admin account and password login are strictly disabled (403 Forbidden). Arbitrary emails, unverified tokens, and hardcoded passwords are rejected.
* **Session Management**: Successful authentication returns an administrator Bearer token (`adm_...`) with a 4-hour lifespan.

---

## 2. Election Scheduling & Configuration (`AdminElectionsScreen.tsx`)

Administrators can configure new elections or update existing schedules:

### Parameters:
1. **Election Title**: e.g., `2026 State Legislative Assembly Election`.
2. **Election Type**: e.g., `Lok Sabha General Election`, `State Legislative Assembly`, `Municipal Corporation`, or `By-Election`.
3. **Numeric Identifier**: e.g., `99` (used for contract domain binding).
4. **Constituency Enrollment**: Checkboxes to select accredited constituencies (`New Delhi`, `Varanasi`, `Wayanad`, `Bangalore South`).
5. **Start and Closing Deadlines**:
   * Exact start date and time (`startTime`).
   * Exact closing deadline (`endTime`).
   * **Validation Rule**: Backend enforces `endTime > startTime`. Submissions with inverted deadlines are rejected with `400 Bad Request`.

---

## 3. Election Lifecycle State Machine

```
     ┌──────────┐
     │  Draft   ├───────────┐
     └────┬─────┘           │
          ▼                 ▼
   ┌─────────────┐   ┌────────────┐
   │  Scheduled  │   │   Active   │◀────┐
   └──────┬──────┘   └─────┬──────┘     │
          │                │            │
          └────────────────┼──────┐     │
                           ▼      ▼     │
                      ┌────────┐ ┌──────┴─────┐
                      │ Paused │ │ Concluded  │ (Terminal)
                      └────────┘ └────────────┘
```

* **Draft**: Election is being configured; candidate registration is open; voting is locked.
* **Scheduled**: Official deadlines confirmed; waiting for start timestamp; voting is locked.
* **Active**: Voting is currently open; EIP-712 tickets are issued to enrolled electors.
* **Paused**: Temporarily halted by Returning Officer (e.g., security investigation); voting is blocked both by backend and smart contract `setElectionStatus(id, 2)`.
* **Concluded**: Voting window has closed; tallies are final and immutable; tickets can no longer be issued.

---

## 4. Candidate & Electoral Roll Operations

* **Register Contesting Candidates (`AdminCandidatesScreen.tsx`)**:
  * Nominate candidates by constituency.
  * Assign official political party and verified reserved symbol (Lotus, Hand, Broom, Elephant, Corn & Sickle, NOTA).
  * Automatically allot free symbols where reserved symbols do not apply.
* **Voter Eligibility Management (`AdminVotersScreen.tsx`)**:
  * Toggle synthetic voter eligibility (`ELIGIBLE` vs `INELIGIBLE`).
  * Safety Rule: Cannot alter eligibility for voters who have already cast a ballot (`status === 'VOTED'`).
  * Transaction Recovery: In the event of an aborted or reverted blockchain transaction, authorized officers can reset an elector from `AUTHORIZED` back to `ELIGIBLE` via `POST /api/admin/voters/:id/reset`.

---

## 5. Audit Logging & Verification (`AdminAuditScreen.tsx`)

* **Tamper-Evident Event Log**: Every critical administrative action (`ADMIN_ACTION`), state transition (`ELECTION_STATE`), and ballot submission (`VOTE_CAST`) is recorded.
* **Zero Candidate Correlation**: `VOTE_CAST` audit entries record the election ID, constituency, transaction hash, and timestamp, but **strictly omit candidate choices**, preserving audit integrity off-chain.
