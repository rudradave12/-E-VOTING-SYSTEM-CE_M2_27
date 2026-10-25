# BlockBallot — Database Architecture & Security Specifications

This directory houses database-specific schemas, security rules, and architectural documentation for the **BlockBallot E-Voting System**.

---

## 1. Storage Architecture Overview

BlockBallot uses a dual-layer persistence strategy:
1. **Google Cloud Firestore (Production / Staging / Emulator)**:
   - Managed NoSQL document store with ACID document writes.
   - Structured collections: `voter_profiles`, `biometric_enrollments`, `voting_sessions`, `manual_id_exceptions`, `elections`, `candidates`, `historical_elections`, `audit_events`.
   - Access is mediated exclusively through the server-side Firebase Admin SDK (`server/firebaseAdmin.ts`) using authenticated service accounts.
2. **In-Memory Cache & Synchronizer (`server/store.ts` & `server/repositories/inMemoryRepositories.ts`)**:
   - High-performance, atomic in-memory repository cache.
   - Seamlessly synchronizes state from Firestore upon server bootstrap.
   - Provides an automated fallback for unit tests and local demonstrations when cloud credentials are unconfigured.

---

## 2. Firestore Security Rules

The authoritative Firestore security rules are maintained in:
- `firestore.rules` (Project Root — used directly by Firebase CLI, `firebase.json`, and automated test suites)
- `database/rules/firestore.rules` (Archival & Governance Mirror)

### 2.1 Why `firestore.rules` Remains at Project Root
Firebase CLI tooling (`firebase deploy --only firestore:rules` and `firebase emulators:start`) requires `firestore.rules` at the root path configured in `firebase.json`. Furthermore, automated security test suites (`src/test/phase7a_security_hardening.test.ts`, `src/test/phase7a1_firestore_admin.test.ts`, and `src/test/phase09_encryption_privacy.test.ts`) assert the presence and integrity of `firestore.rules` at the root. To maintain 100% compatibility across development, testing, and deployment scripts without breaking references, the root file remains authoritative.

### 2.2 Security Boundary Enforcement
* **`voter_profiles`**: Client writes are denied (`allow write: if false;`). Client reads are restricted strictly to administrators or the authenticated profile owner (`request.auth.uid == profileId`).
* **`biometric_enrollments`**: Client reads and writes are denied (`allow read, write: if false;`). Accessible only via backend service account with field-level AES-256-GCM encryption.
* **`manual_id_exceptions`**: Client reads and writes are denied (`allow read, write: if false;`). Managed strictly via authoritative `/api/admin/exceptions` endpoints.
* **`voting_sessions`**: Client reads and writes are denied (`allow read, write: if false;`). Sessions exist only in server memory and backend Firestore collections.
* **`historical_elections` & `historical_constituencies`**: Publicly readable, write-protected (`allow write: if false;`).

---

## 3. Versioned Schema Migrations

The database migration inspector is located at [`scripts/inspect-and-migrate-data-model.ts`](file:///e:/Projects/BlockBallot-EVoting-System/scripts/inspect-and-migrate-data-model.ts).

### Usage:
```bash
# Dry-run inspection:
npm run model:migrate

# Apply migration (opt-in):
npm run model:migrate -- --persist
```
