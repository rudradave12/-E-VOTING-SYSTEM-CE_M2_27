# BlockBallot — Data Migration & Schema Evolution Plan

> **Phase**: Phase 02 — Database and Election Data Model  
> **Target Schema Version**: `2.0`  
> **Source Schema Version**: `1.0` (Legacy Single-Collection Voter Store)  
> **Feature Branch**: `feature/simulation-voter-registry-rbac`

---

## 1. Migration Overview & Strategy

Phase 02 transitions the persistence layer from a flat `VoterRecord` structure in `/voters` to a segregated, domain-driven model across:
1. `/voter_profiles` (Civic simulation identities)
2. `/voter_election_participation` (Independent per-election voting lifecycle)
3. `/biometric_enrollments` (Opaque reference metadata)
4. `/ballots` (Anonymous vote receipts)
5. `/authority_accounts` (RBAC accounts)
6. `/audit_events` (Append-only security log)

### Non-Destructive Copy & Source Preservation Invariant
- **Source Preservation**: Existing documents in `/voters` are **NOT** deleted during migration. They remain untouched as a rollback fallback.
- **Idempotency**: Repeated execution of the migration script safely checks if target documents already exist with `schemaVersion: '2.0'`, skipping them to avoid overwriting newer data.
- **Fail-Closed Safeguards**: Any destructive write requires **BOTH** `--execute` and `--confirm` flags. Direct execution against production environments is strictly prohibited.

---

## 2. Schema Transformation Mapping

```mermaid
flowchart TD
    subgraph Legacy [Legacy Schema 1.0 (/voters)]
        LV[VoterRecord\n- id: voter-01\n- epicId: IND-DL-982341\n- name\n- age\n- status: VOTED\n- constituencyId]
    end

    subgraph Phase02 [Target Schema 2.0]
        VP[VoterProfile (/voter_profiles)\n- id: vpr_voter-01\n- simulationVoterId: SIM-IND-DL-982341\n- legacyEpicId: IND-DL-982341\n- fullName: name\n- dateOfBirth: YYYY-01-01 derived from age\n- registrationStatus: REGISTERED\n- eligibilityStatus: ELIGIBLE\n- schemaVersion: 2.0]
        
        VEP[VoterElectionParticipation (/voter_election_participation)\n- id: vpr_voter-01_GE-2024\n- voterId: vpr_voter-01\n- electionId: GE-2024\n- status: VOTE_ACCEPTED\n- schemaVersion: 2.0]
    end

    LV -->|Transform & Validate| VP
    LV -->|Derive Initial Election State| VEP
```

### Detailed Field Mapping:
| Legacy Field (`/voters`) | Target Collection | Target Field | Transformation Rule |
| :--- | :--- | :--- | :--- |
| `id` | `voter_profiles` | `id` | Prefixed with `vpr_` (e.g., `vpr_voter-01`) |
| `epicId` | `voter_profiles` | `simulationVoterId` | Normalized to `SIM-...` prefix |
| `epicId` | `voter_profiles` | `legacyEpicId` | Preserved verbatim for audit traceability |
| `name` | `voter_profiles` | `fullName` | Trimmed string |
| `age` | `voter_profiles` | `dateOfBirth` | Canonical ISO 8601 (`(CurrentYear - age)-01-01`) |
| `constituencyId` | `voter_profiles` | `constituencyId` | Preserved verbatim |
| `isEligible` | `voter_profiles` | `eligibilityStatus` | `true` -> `'ELIGIBLE'`, `false` -> `'INELIGIBLE_DISQUALIFIED'` |
| `status` (`VOTED` / `AUTHORIZED`) | `voter_election_participation` | `status` | `'VOTED'` -> `'VOTE_ACCEPTED'`, otherwise `'ELIGIBLE'` |
| `votedAt` | `voter_election_participation` | `votedAt` | Preserved timestamp |

---

## 3. Tooling & Execution Commands

A dedicated migration inspection and execution script is provided in `scripts/inspect-and-migrate-data-model.ts` (aliased in `package.json` as `npm run model:migrate`).

### A. Dry Run Inspection (Default Safe Mode)
Inspects the target database, detects legacy schema documents, scans for anomalies (missing fields, duplicate EPIC IDs, corrupted states), and prints a comprehensive execution plan without modifying any records:

```bash
# Standard dry run across configured Firestore database or emulator
npm run model:migrate
```

**Dry Run Report Output Structure**:
- `Mode`: `DRY_RUN`
- `Target Environment`: e.g. `Firestore Emulator (127.0.0.1:8088)` or `Cloud Firestore (NODE_ENV=development)`
- `Total Scanned`: Count of documents in `/voters`
- `Legacy 1.0 Records`: Count of documents needing migration
- `Current 2.0 Records`: Count of documents already migrated
- `Anomalies Found`: List of duplicate IDs, missing required fields, or validation failures
- `Migrated / Skipped / Failed`: Projected outcome counts

### B. Confirmed Execution Mode (Emulator / Staging)
Executes non-destructive transformation and writes new records to `/voter_profiles` and `/voter_election_participation`:

```bash
# Execute migration with explicit confirmation
npm run model:migrate -- --execute --confirm
```

---

## 4. Phase 01 Legacy Demo Voter Cleanup Status

Phase 01 removed all hardcoded demo voter records (`voter-01` through `voter-06`) from normal application startup and runtime memory.

A dedicated cleanup script exists to purge already-persisted legacy sample records from Firestore:
`scripts/cleanup-legacy-demo-voters.ts` (aliased as `npm run voters:cleanup`).

### Operational Status of Cleanup:
* **Dry Run Verified**: Executing `npm run voters:cleanup` runs safely in dry-run mode and confirms 0 active legacy records in unconfigured/empty stores.
* **Pending Live Database Step**: As documented in the Phase 01 completion report, live persistent cloud database deletion has not been executed because live Firebase credentials were not injected in local development.
* **Safe Emulator Command for Testing**:
  ```bash
  # Start local emulator
  npm run emulator:start
  
  # Execute targeted cleanup on local emulator
  FIRESTORE_EMULATOR_HOST="127.0.0.1:8088" npm run voters:cleanup -- --execute --confirm
  ```

### Protection Guarantees:
1. `cleanupLegacyDemoVoters()` targets **ONLY** the 6 exact legacy demo documents (`voter-01` to `voter-06`).
2. Broad queries (e.g. deleting all documents with name or generic prefix) are forbidden.
3. The demo administrator account (`demo.admin@blockballot.local`), elections, constituencies, candidates, audit logs, and historical archives are **NEVER** touched.

---

## 5. Rollback & Disaster Recovery Procedures

Because migration is strictly **non-destructive copy**:
1. If an error occurs during migration execution, source documents in `/voters` remain intact.
2. If rolled back, the application can continue reading from `/voters` via the Phase 01 compatibility adapter.
3. The new collections (`/voter_profiles`, `/voter_election_participation`) can be safely purged in staging without data loss.
