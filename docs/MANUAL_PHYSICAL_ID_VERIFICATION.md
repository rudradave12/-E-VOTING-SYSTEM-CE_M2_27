# BlockBallot — Manual Physical-ID Verification & Exception Approval Documentation

**Phase:** Phase 06 — Manual Physical-ID Verification & Exception Approval  
**Branch:** `feature/simulation-voter-registry-rbac`  
**Base Commit:** `4b9fe2e82cda3f8567437a756168c9d302698d7f` (Phase 05 Completion)  
**Standard Status:** Production-Grade Separation of Duties, ECI In-Person Verification & Fail-Closed Privacy  

---

## 1. Executive Summary & Design Principles

BlockBallot Phase 06 implements an audited, role-separated **Manual Physical-ID Verification and Exception Workflow** designed to handle real-world electoral edge cases:
- Physical limitations or disabilities (worn fingerprints, amputations, tremors).
- Hardware failures (absent USB drivers, missing biometric peripherals, camera malfunction).
- Degradation at voter registration counters or polling stations.

### Key Architectural Principles:

1. **Two Distinct, Non-Transferable Exception Purposes:**
   - **Enrollment-Time Exception (`ENROLLMENT`):** Excuses a missing biometric modality (`FACE` or `FINGERPRINT`) during elector registration. Transitions biometric metadata to `MANUALLY_APPROVED` with `isManualException: true`. **Never** marks modality as `ENROLLED` and **never** authorizes a later voting session.
   - **Voting-Time Exception (`VOTING_SESSION`):** Grants single-use authorization for a specific voting session attempt when biometric authentication cannot be completed at the polling station. Strictly time-bound to 15 minutes and cryptographically bound to the exact voter, election, and session token.

2. **Strict Separation of Duties (`requester !== reviewer`):**
   - A **Voter Registration Officer (`VRO-SIM-001`)** or an **Election Officer (`EO-SIM-001`)** can submit exception requests within their assigned jurisdiction.
   - Only an independent **Election Officer (`EO-SIM-002`)** or **Platform Administrator** can review, approve, or decline pending exception requests.
   - **Hard Invariant:** An officer can **never** approve or decline an exception request they submitted. Self-approvals fail closed with `HTTP 403 Forbidden`.

3. **ECI Physical In-Person Inspection (Zero Document Scans or Numbers Stored):**
   - Officers physically inspect approved national identity documents (EPIC / Voter ID Card, Aadhaar Card, Passport, PAN Card, Driving License, etc.) in the elector's presence.
   - **Hard Invariant:** No document photographs, scans, image data URIs, raw bytes, or government identity numbers (such as 12-digit Aadhaar patterns) are ever uploaded, transmitted, or persisted. Submitting any document scan or personal identifier fails closed with `HTTP 400 Bad Request`.

4. **Honest Labeling — Not Biometric Enrollment:**
   - Manually approved biometric modalities are explicitly recorded as `MANUALLY_APPROVED` with `isManualException: true` and `qualityCheckStatus: 'EXEMPTED'`.
   - They are **never** reported as `ENROLLED` and never misrepresented as biometric matches. Face and Fingerprint modalities remain strictly independent.

5. **Single-Use, Time-Bound Voting Session Consumption:**
   - Approved voting exceptions expire automatically after **15 minutes** under server control (`expiresAt`).
   - Consumption via `POST /api/voter/consume-exception` transitions the record to `CONSUMED`.
   - Re-consumption is blocked with `HTTP 409 Conflict`.
   - Deactivated electors, ineligible electors, and voters who have already cast a ballot (`status: 'VOTED'`) cannot consume exceptions.

---

## 2. Data Model & Lifecycle State Machine

### Schema (`src/types/dataModel.ts`)

```typescript
export type ExceptionPurpose = 'ENROLLMENT' | 'VOTING_SESSION';

export type ExceptionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'CONSUMED';

export type ExceptionDecisionOutcome =
  | 'MANUAL_PHYSICAL_ID_APPROVED'
  | 'MANUAL_PHYSICAL_ID_DECLINED';

export type ExceptionReasonCode =
  | 'FINGERPRINT_UNREADABLE_OR_WORN'
  | 'FINGERPRINT_SCANNER_NOT_DETECTED'
  | 'FACE_CAPTURE_LIGHTING_OR_HARDWARE_FAILURE'
  | 'PHYSICAL_DISABILITY_OR_AMPUTATION'
  | 'CAMERA_UNAVAILABLE'
  | 'ELDERLY_OR_INFIRM_ELECTOR'
  | 'NETWORK_OR_STATION_DEGRADATION'
  | 'OTHER_OFFICIAL_REASON';

export interface ManualIdExceptionRecord {
  id: string; // EX-REQ-YYYYMMDD-XXXX
  schemaVersion: string;
  voterId: string;
  simulationVoterId: string;
  constituencyId: string;
  purpose: ExceptionPurpose;
  modality?: 'FACE' | 'FINGERPRINT';
  electionId?: string;
  votingSessionTokenHash?: string;
  requestedByOfficerId: string;
  requestedByOfficerRole: AuthorityRole;
  requestedAt: number;
  reasonCode: ExceptionReasonCode;
  note?: string;
  status: ExceptionStatus;
  reviewedByOfficerId?: string;
  reviewedByOfficerRole?: AuthorityRole;
  reviewedAt?: number;
  decisionReason?: string;
  decisionOutcome?: ExceptionDecisionOutcome;
  expiresAt?: number; // 15-minute server timestamp for voting sessions
  consumedAt?: number;
  consumedInElectionId?: string;
  createdAt: number;
  updatedAt: number;
}
```

### Lifecycle Transition Matrix

| Initial State | Event / API Action | Next State | Authorized Role | Guard Conditions |
|---|---|---|---|---|
| *(None)* | `POST /api/admin/exceptions` | `PENDING` | VRO, EO, Platform Admin | Requester in scope; Voter active; No duplicate pending request. |
| `PENDING` | `POST /api/admin/exceptions/:id/approve` | `APPROVED` | EO, Platform Admin | `reviewer !== requester`; Decision reason ≥ 5 chars; Elector in scope. |
| `PENDING` | `POST /api/admin/exceptions/:id/decline` | `DECLINED` | EO, Platform Admin | `reviewer !== requester`; Decision reason ≥ 5 chars; Elector in scope. |
| `APPROVED` | `POST /api/voter/consume-exception` | `CONSUMED` | Elector Session | Purpose is `VOTING_SESSION`; `now <= expiresAt`; Valid token hash; Voter active & not voted. |
| `APPROVED` | Elapsed 15-min window on attempt | `EXPIRED` | System / Voter API | `now > expiresAt`. Returns HTTP 403 Forbidden. |
| Any | Re-consumption attempt | *(Blocked)* | Any | Returns HTTP 409 Conflict. |

---

## 3. Workflow Specifications

### Workflow A: Enrollment-Time Physical-ID Verification

1. **Trigger:** Voter Registration Officer (`VRO-SIM-001`) encounters an elector who cannot provide a face or fingerprint scan (e.g. skin condition, missing limb, camera failure).
2. **Request:** VRO clicks *"Request Physical ID Verification"* in `FaceEnrollmentScreen` or `FingerprintEnrollmentScreen`. An audited request is created with `purpose: 'ENROLLMENT'`, the specific `modality`, and a mandatory `reasonCode`.
3. **Biometric Metadata Flag:** The voter's biometric record enters `status: 'PENDING_MANUAL_REVIEW'` with `isManualException: true` and `manualExceptionId`.
4. **Officer Review:** An authorized Election Officer (`EO-SIM-001` or independent EO) opens `AdminExceptionsScreen`, physically inspects the elector's official documentation, enters a mandatory audited decision justification (≥ 5 characters), and clicks *"Approve Exception"*.
5. **Outcome:**
   - Biometric metadata updates to `status: 'MANUALLY_APPROVED'`.
   - `qualityCheckStatus` is set to `'EXEMPTED'`.
   - `isManualException: true` remains permanently recorded.
   - **Crucial Invariant:** Modality is **never** marked `ENROLLED`. Modalities remain completely independent (e.g., face exception does not affect fingerprint).

### Workflow B: Polling-Time Exception for Voting Session

1. **Trigger:** An eligible voter arrives at a voting booth, but biometric verification fails or station hardware is degraded.
2. **Request:** Polling station officer submits an exception request with `purpose: 'VOTING_SESSION'`, `electionId: '1'`, and `votingSessionTokenHash` bound to the elector's current polling kiosk attempt.
3. **Independent Decision:** An independent Election Officer verifies the elector's physical Voter ID card and approves the request. The server assigns an explicit 15-minute validity window (`expiresAt = Date.now() + 15 * 60 * 1000`).
4. **Consumption:** The voting client submits `POST /api/voter/consume-exception` with `exceptionId`, `voterId`, `electionId`, and `votingSessionToken`.
5. **Security Enforcements:**
   - Voter profile must be `REGISTERED`, `ACTIVE`, and `ELIGIBLE`.
   - Voter must not have already cast a finalized ballot (`status !== 'VOTED'`).
   - Election must be `active`.
   - Session token hash must match the cryptographic hash recorded in the exception.
   - Status updates atomically to `CONSUMED`.
6. **One-Vote Guarantee:** Once consumed, the token cannot be reused, shared, or applied to another election.

---

## 4. Separation of Duties Matrix

| Operation | VRO (`VRO-SIM-001`) | EO (`EO-SIM-001`) | Independent EO (`EO-SIM-002`) | Platform Admin |
|---|---|---|---|---|
| Request Enrollment Exception | **Allowed** (In Scope) | Allowed (In Scope) | Allowed (In Scope) | Allowed |
| Request Voting Session Exception | Allowed (In Scope) | **Allowed** (In Scope) | Allowed (In Scope) | Allowed |
| Approve / Decline VRO Request | Denied (HTTP 403) | **Allowed** (In Scope) | **Allowed** (In Scope) | Allowed |
| Approve / Decline Self-Submitted Request | Denied (HTTP 403) | **Denied (HTTP 403)** | **Denied (HTTP 403)** | Allowed (Override) |
| Approve / Decline Peer EO Request | Denied (HTTP 403) | **Allowed** (In Scope) | **Allowed** (In Scope) | Allowed |
| Read Out-of-Scope Exceptions | Denied (HTTP 403) | Denied (HTTP 403) | Denied (HTTP 403) | Allowed |

---

## 5. Security & Privacy Guarantees

### Zero Document Storage
The backend and frontend strictly prohibit uploading, passing, or storing:
- Image blobs, JPEG/PNG streams, base64 data URIs (`data:image/*`, `base64,`).
- Aadhaar numbers (regex detection for `\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b`).
- Passport, PAN, or voter EPIC numbers in freeform notes.
- Forbidden key detection (`photo`, `scannedDocument`, `documentImage`, `aadhaarNumber`, etc.).

### Fail-Closed Auditing
Every state change triggers a structured audit event in `serverStore` and Firestore:
- `MANUAL_ID_EXCEPTION_REQUESTED`
- `MANUAL_ID_EXCEPTION_APPROVED`
- `MANUAL_ID_EXCEPTION_DECLINED`
- `MANUAL_ID_EXCEPTION_CONSUMED`

Each event immutably logs the actor ID, actor role, timestamp, target exception ID, constituency, and outcome.

---

## 6. Verification & Test Suite

The manual physical-ID verification architecture is verified by **19 automated end-to-end tests** in `src/test/phase06_manual_id_exceptions.test.ts`:

1. VRO can request enrollment exception within assigned jurisdiction (`CONST-04-ND`).
2. Invalid reason codes, malformed requests, and schema violations return HTTP 400.
3. Election Officer can review and approve in-scope pending request with mandatory reason.
4. Voter Registration Officer cannot approve or decline exception requests (HTTP 403).
5. Officer cannot approve or decline their own exception request (Separation of Duties).
6. Out-of-scope requests cannot be created, viewed, or decided by restricted officers.
7. Unauthenticated, expired, revoked, and forged sessions fail closed.
8. Duplicate or conflicting decisions on the same exception record are rejected (HTTP 409 Conflict).
9. Manual exceptions never mark biometric modality as `ENROLLED` in schema or repository.
10. Approved outcome is explicitly labeled `MANUAL_PHYSICAL_ID_APPROVED` and never as a biometric match.
11. Enrollment-time exception approval cannot authorize a later voting session.
12. Voting-time exception is strictly bound to exact voter, election, and session token hash.
13. Expired, mismatched, revoked, and already-consumed approvals cannot authorize voting.
14. Inactive voters, ineligible voters, and closed elections cannot consume voting exceptions.
15. Duplicate vote prevention is enforced; voter cannot consume exception if already voted.
16. Structured audit events are recorded for exception lifecycle events.
17. Document scans, photo uploads, and identity document numbers are strictly rejected.
18. Existing Phase 01–05 behavior, voter registry, and biometric metadata endpoints remain intact.
19. Full suite regression passes with zero failures.

---

## 7. Phase Boundaries & Non-Goals

- **Completed in Phase 06:**
  - Manual physical-ID verification workflows (Enrollment and Voting session).
  - Role-based separation of duties and jurisdiction scoping.
  - Fail-closed privacy filters prohibiting document uploads.
  - Single-use 15-minute consumption protocol.
  - Dedicated admin exceptions queue UI (`AdminExceptionsScreen`).
- **Deferred to Future Phases:**
  - **Phase 07:** Multi-language UI and vernacular localization (Hindi, Tamil, Telugu, etc.).
  - **Phase 08:** Offline synchronization, batch sync protocols, and production deployment finalization.
