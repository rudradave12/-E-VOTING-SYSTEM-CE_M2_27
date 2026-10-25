# Phase 00 — Repository and Hardware Audit

**Project:** BlockBallot  
**Audit date:** 2026-10-24  
**Repository:** rudradave12/blockballot-e-voting-system  
**Audited base branch:** main  
**Base commit:** dc7f82f4bd8711000c147f6679802f601795d003  
**Audit branch:** feature/simulation-voter-registry-rbac  
**Scope:** Read-only inspection of source, tests, scripts and existing engineering documentation. No application source code was changed during Phase 00.

## 1. Executive summary

BlockBallot already has a React/Vite/TypeScript frontend, an Express/TypeScript backend, Firestore persistence adapters, Solidity/Hardhat integration, historical-election data, admin workflows and a substantial automated test suite.

The next phase must not merely remove the sample IDs from one screen. Fixed demo voters are referenced in frontend state, a UI fallback, backend memory seeding, Firestore initialization, tests and documentation. These dependencies must be removed or replaced together while preserving test coverage and the local demo administrator login.

The current voter-enrollment form is not a complete persistent backend workflow. The admin screen creates a voter object in the browser and passes it to a frontend state update; an authorized server endpoint for creating a voter was not found in the reviewed admin routes. Editing and deactivation endpoints are also not yet present as a complete CRUD flow.

The currently implemented admin session model keeps a role value, but the shared authorization helper primarily checks whether an active session token exists. It does not yet enforce the two distinct operational roles and their action-level permissions you want.

No fingerprint scanner make/model, driver/SDK package or connected face-capture device is identified in the repository reviewed here. Hardware integration must remain unselected until device details are provided.

## 2. Existing architecture confirmed from repository files

| Area | Existing implementation |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS, Lucide icons, Motion |
| API | Node.js + Express, TypeScript (server.ts, server/routes/*) |
| Persistence | Firebase Admin SDK + Cloud Firestore; emulator support |
| Blockchain | Solidity contract in contracts/IndianElection.sol, Hardhat and Ethers.js |
| Voter identity lookup | Existing EPIC-format validation and HMAC-based lookup indexing |
| Authentication | OTP challenge and short-lived voter JWT; admin sessions |
| Historical data | src/data/historical2024.ts and server/routes/historical.ts |
| Tests | src/test/*.test.ts, integration runner and Firestore emulator test script |
| Admin seed | npm run admin:seed; generated local password belongs in ignored .env.local |
| Other scripts | npm run test:integration, npm run emulator:test, npm run benchmark, npm run lint, npm run build |

The existing admin seed script provisions the local demo account demo.admin@blockballot.local. Preserve this account and command; never add its generated password or .env.local secrets to source control.

## 3. Phase 01 dependency map: fixed demo voters

The old sample voter records are defined by SYNTHETIC_VOTERS in src/data/mockData.ts. The reviewed list contains six fixed identities, including the legacy IDs beginning with IND-.

They are consumed in these places:

- src/App.tsx: initializes the frontend voter state from SYNTHETIC_VOTERS; admin enrollment currently appends to frontend state.
- src/components/screens/IdentifyScreen.tsx: imports the sample list, searches the local roster and falls back to sample records when the provided roster is empty. Its network-error handling can still fall through to the local voter journey; this must become fail-closed.
- src/components/PersonaQuickBar.tsx: exposes preset voter shortcuts.
- src/components/screens/PracticeVotingScreen.tsx: displays the preset sample-voter cards.
- server/store.ts: imports and seeds the fixed voter records during store reset/startup.
- server/firestore.ts: contains Firestore initialization that seeds the synthetic electoral roll when the voter collection is empty.
- Tests such as phase4_server.test.ts, ux_redesign.test.ts, phase7f_final_completion.test.ts, phase7d_blockchain_integration.test.ts, phase7a_security_hardening.test.ts, phase5_election_management.test.ts, eip712.test.ts, and others reference the old IDs as fixtures.
- README and workflow/demo documents expose sample IDs and sample-person workflows.

**Phase 01 migration constraint:** do not delete all Firestore voter documents. Prepare a dry-run, explicitly confirmed cleanup targeting only the known legacy sample IDs/records. Keep historical-election data, constituency/candidate reference data, audits and the demo administrator untouched. Move any required test records into isolated test-only factories/fixtures rather than app startup seeds.

## 4. Voter enrollment and identity-flow gaps

### Frontend

AdminVotersScreen.tsx currently accepts a manually entered ID and builds a VoterRecord on the client. The supplied ID is not yet generated by the server. In App.tsx, the current onAddVoter callback only appends to local React state.

IdentifyScreen.tsx looks for a matching local voter before completing the API journey. This prevents a server-generated identity from being the authoritative source, and the fallback behavior can allow the app to continue when the API is unavailable.

### Backend

The reviewed server/routes/admin.ts contains voter list, eligibility-toggle and authorization-reset routes, but a complete protected POST /api/admin/voters, edit and deactivation lifecycle was not found.

The voter API currently validates traditional EPIC-like format or a development-only IND- format. The planned simulation ID (e.g. BBV-SIM-<cryptographically-random-token>) requires new server-side validation and a backend lookup against a persisted record. It must not be accepted merely because its shape looks valid.

Voter OTP challenges have a configured 180-second expiry, 60-second cooldown and three-attempt limit. The docs SECURITY_AND_LIMITATIONS.md and VOTER_WORKFLOW_GUIDE.md still mention a five-minute expiry in some places. The actual configuration and all docs should be aligned during a later implementation/documentation phase. OTP guessing protection and duplicate-vote protection are separate controls.

### Persistence and lifecycle

The current model has one global voter lifecycle status (ELIGIBLE, AUTHORIZED, VOTED). A voter may be eligible for more than one election, so the planned model needs separate per-election participation records, keyed uniquely by voter and election. A voter finishing one election must not be automatically prohibited from a different eligible election.

Some in-memory store operations persist asynchronously; current data and transaction flow must be reviewed before relying on it for race-safe duplicate-prevention. For final vote acceptance, use a persistent atomic/transaction-safe operation and never let a failed client request decide whether a ballot was accepted.

## 5. Role and authorization gaps

The proposed first release needs only two operational roles:

- **Election Officer** — create/manage simulation elections and candidates, manage election timing, and approve/decline the physical-ID exception for a particular registration/session.
- **Voter Registration Officer** — create and edit voter profiles, initiate face/fingerprint enrollment, and submit a scanner/camera failure exception for review.

The existing local demo administrator remains a separate top-level local system-management account, not a third day-to-day officer role.

The admin login response currently returns a broad permission list, and the session record stores a role. However, verifyAdminAuth() does not by itself check a required permission or jurisdiction. In the Firebase ID-token verifier, certain broad claims (admin === true, role === 'commissioner', or role === 'officer') satisfy the admin check. Before introducing the two roles, replace broad boolean authorization with a centralized server-side permission check for each route/action, and verify the role and scope against trusted server-managed assignments. The UI must not be the security boundary.

## 6. Biometrics and hardware readiness

No biometric enrollment component, scanner adapter/SDK dependency, biometric template schema or WebAuthn/passkey implementation was found in the reviewed tree/searches.

Planned requirements to settle in Phases 04–09:

- Separate Face Enrollment and Fingerprint Enrollment screens with device status, capture/scan progress, quality result, Save, Retake and Cancel.
- Capture one reference photo during enrollment; during voting capture a fresh live sequence, run a tested liveness check and compare it with the authorized reference when that enrollment exists.
- Fingerprint capture is a registration-time action for the first version. Do not display a fingerprint as “verified now” unless a fingerprint was actually checked in that session.
- If a device fails, record a pending exception and require physical-ID review. The Registration Officer may request an exception; the Election Officer approves or declines it. During a later voting session, an enrollment-time approval alone is insufficient: an Election Officer must verify the physical ID and approve that specific session when the biometric check cannot be performed.
- Preserve method/result labels truthfully (FACE_MATCHED, FINGERPRINT_ENROLLED, MANUAL_PHYSICAL_ID_APPROVED, PENDING_REVIEW, DECLINED). Manual approval must never be presented as a successful biometric match.
- Keep biometric data out of ballots and public APIs. Do not store continuous video by default or expose raw fingerprint images/templates to ordinary officers.
- Hardware-specific integration cannot be chosen until the fingerprint scanner brand/model, operating system, driver/SDK availability and camera type are known.

## 7. Ballot privacy, election data and public information

The repository documentation already identifies a ballot-secrecy limitation: the Solidity contract exposes the chosen candidate identifier in transaction calldata/events. Do not claim that ballots are secret until a privacy-preserving design has been implemented and independently reviewed.

Historical results currently have a dedicated module/API and provenance metadata. Existing tests check for a limited set of historical constituency records, but this audit did not establish complete all-India archival coverage or a connected nationwide live turnout feed. A future dashboard must show real dataset coverage, source, publication time and freshness; missing live data must not be substituted with fabricated official-looking figures.

## 8. Test baseline: evidence and limitations

Available scripts in package.json:

- npm test
- npm run test:integration
- npm run emulator:test
- npm run lint
- npm run build

The README and docs/FINAL_VERIFICATION_AND_GAPS.md claim 114/114 test assertions pass when required local services are available; they also document live blockchain and Firestore emulator test flows.

**Important verification qualification:** these commands were not executed as part of this connected-repository audit. The connected GitHub Actions run query returned no workflow runs, and no .github workflow directory was found at the audited branch. Therefore, the test counts above are prior repository-documentation claims, not fresh results from Phase 00. Run the scripts in the local Antigravity workspace and preserve their actual terminal outputs before treating the baseline as verified.

## 9. Agreed phase plan

1. **Phase 00 — Repository and hardware audit:** this document; no application source edits.
2. **Phase 01 — Remove preloaded demo voters:** remove the fixed runtime voter list and fallbacks, isolate test fixtures, retain the demo admin and historical data, add a targeted dry-run cleanup.
3. **Phase 02 — Database and election data model:** separate voter identity, biometrics, voter/election participation, ballot and audit records.
4. **Phase 03 — Two officer roles and permissions:** backend-enforced role/permission checks and audited, scoped actions.
5. **Phase 04 — Voter registry and generated IDs:** backend-only ID generation and persistent create/edit/deactivate workflows.
6. **Phase 05 — Separate face and fingerprint enrollment pages:** real device status, capture, review, save/cancel and failure UX.
7. **Phase 06 — Manual verification exception:** physical-ID review, Election Officer approval/decline and session-specific audit history.
8. **Phase 07 — Election creation and timers:** server-authoritative election lifecycle and deadlines.
9. **Phase 08 — Voting/session security:** live face check, exception handling, fullscreen policy, session expiry and atomic one-vote-per-election enforcement.
10. **Phase 09 — Encryption and privacy:** biometric protection, key handling, redaction, identity/ballot separation.
11. **Phase 10 — Historical election archive:** verify provenance and coverage; read-only records.
12. **Phase 11 — Public Election Monitor:** source-backed aggregated data and geographic navigation.
13. **Phase 12 — UI/UX integration:** cohesive responsive pages, accessibility and failure states.
14. **Phase 13 — End-to-end verification and release review:** real test execution, threat testing and limitations report.

## 10. Phase 00 status

**Code audit:** Completed against the listed repository base commit.  
**Application modifications:** None.  
**Fresh test execution:** Not performed from this connected repository view; local execution is required.  
**Fingerprint hardware:** Not yet identified.  
**Face device:** Not yet identified.  
**Next phase:** Phase 01, only after review of this audit and confirmation of the actual hardware details needed for the later biometric phase.
