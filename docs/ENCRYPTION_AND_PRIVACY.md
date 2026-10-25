# BlockBallot — Phase 09: Encryption, Data Privacy & Ballot Confidentiality

## 1. Executive Summary & Security Status

BlockBallot is an academic simulation of a cryptographically secured parliamentary e-voting system designed to explore the integration of sovereign digital identity (EPIC), time-bound HMAC verification challenges, EIP-712 cryptographic authorization, role-based access control (RBAC), and blockchain-based nullifier burning.

> [!WARNING]
> **Academic Simulation Notice**: BlockBallot is an academic prototype and engineering simulation. It is **not legally certified**, audited for statutory elections, or intended for real-world civic polling without independent cryptographic formal verification, hardware security modules (HSM), and statutory regulatory compliance (e.g., ECI standards, Common Criteria EAL4+).

Phase 09 establishes a rigorous security baseline:
- Field-level authenticated encryption at rest using **AES-256-GCM** with 12-byte cryptographically secure IVs, 16-byte authentication tags, and domain-bound Additional Authenticated Data (AAD).
- Typed **Key Provider Abstraction** (`IKeyProvider`, `LocalKeyProvider`) supporting versioning (`bb-enc-v1`, `bb-enc-v2`), key rotation, and production fail-closed safeguards.
- Transport and perimeter security via **Strict-Transport-Security (HSTS)**, restrictive **Content-Security-Policy (CSP)**, same-origin CORS boundaries, and hardened **Firestore Security Rules** denying direct client SDK access to sensitive collections.
- Data minimization across voter-facing and administrative endpoints, masking sensitive PII (EPIC, mobile, email) and strictly rejecting prohibited biometric or credential payloads at server boundaries.
- A thorough empirical investigation of blockchain ballot confidentiality, confirming that **candidate choice is disclosed in plaintext calldata and events** in the current EVM smart contract, establishing this finding as an explicit, documented **Release Blocker for Phase 13**.

---

## 2. Comprehensive Data Inventory & Sensitivity Classification

The system processes multiple data classifications across its React client, Express API server, Firestore persistence layer, and Ethereum (EVM) blockchain.

| Data Category | Specific Fields | Storage Location | Accessible Roles | Encryption Status | Retention Expectation | Linkage & Re-identification Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Voter Identity (PII)** | Full name, DOB, gender, state, district, constituencyId, pollingStation | Server Firestore `voter_profiles`, in-memory `serverStore` | `VOTER_REGISTRATION_OFFICER`, `ELECTORAL_SUPERVISOR`, `PLATFORM_ADMIN` (scoped) | Plaintext in simulation roll; masked on public API; supports AES-256-GCM field encryption | Permanent during electoral roll lifecycle | High if unmasked; linked to constituency and polling station |
| **Voter Contact Details** | Mobile number, email address | `voter_profiles`, test OTP delivery adapter | Officers (scoped); Voter self (masked) | Masked in API responses (`+91 98*** **345`); AES-256-GCM field encrypted at rest | Duration of active registration roll | Moderate; correlation with external telecom records |
| **Voter Simulation Identifiers** | `id` (e.g. `vpr_...`), `simulationVoterId` (e.g. `BBV-SIM-...`), `legacyEpicId` | `voter_profiles`, Firestore indices | Scoped officers, Voter self | Indexed plaintext (pseudonymous simulation ID) | Permanent for electoral roll index integrity | Low to Moderate; simulation IDs are pseudonymous |
| **Authentication & Session Tokens** | Session token, OTP HMAC challenge, JTI, expiry, session lock flags | Server in-memory `serverStore`, private `voting_sessions` collection | Server authoritative only; voter receives ephemeral bearer token | In-memory hash; HMAC-SHA256 challenge hash; client denied Firestore access | Ephemeral: OTP expires in 180s; session expires in 900s | Low; single-use, rotated upon consumption |
| **Biometric Metadata (Phase 05)** | Modality (`FACE_PREVIEW`, `FINGERPRINT_ADAPTER`), enrollment status, template hash | `biometric_metadata` collection | Scoped officers | SHA-256 template hash only; raw payloads strictly prohibited | Roll lifetime (metadata only) | Very Low; raw minutiae/frames never stored |
| **Physical-ID Exception Records (Phase 06)** | Exception ID, voterId, purpose, modality, decisionReason, status, decisionOutcome | `manual_id_exceptions` collection | `VOTER_REGISTRATION_OFFICER`, `ELECTORAL_SUPERVISOR` | Structured metadata only; document images/Aadhaar prohibited | Statutory election cycle retention (audit trail) | Low; no raw image files or national ID numbers |
| **Participation Records (Phase 07)** | `voterId`, `electionId`, `status` (`VOTE_ACCEPTED`), `votedAt`, `txHash` | `voter_participations` collection | Electoral Officers; Voter self-status | Server-side record; denied client write | Retained per election cycle | Moderate; proves turnout without candidate selection |
| **Ballots & Blockchain State** | `electionId`, `constituencyId`, `candidateId`, `nullifier`, `txHash`, `voterWallet` | EVM contract storage, transaction calldata, contract events (`VoteCast`) | **Publicly readable on blockchain** | **Plaintext on-chain** (calldata & event) | Immutable on blockchain ledger | **CRITICAL**: On-chain candidate choice is linkable to `voterWallet` and calldata |
| **Audit Logs** | Event ID, timestamp, type, description, actor ID, txHash, nullifier | `audit_events` collection, in-memory stream | `AUDIT_READ` officers, public summary | Redacted via `sanitizeLogData`; secrets and candidate selections excluded | Permanent for transparency and audit replay | Low; sanitized of personal data and candidate choices |

---

## 3. Encryption at Rest: Authenticated Encryption Specification

### 3.1 Primitives and Envelope Specification
Field-level encryption at rest uses Node.js native `crypto.createCipheriv` with authenticated encryption:
- **Cipher**: `AES-256-GCM` (NIST SP 800-38D compliant).
- **Key Length**: 256 bits (32 bytes), managed via `IKeyProvider`.
- **Initialization Vector (IV / Nonce)**: 96 bits (12 bytes), generated per encryption operation via `crypto.randomBytes(12)`. IV reuse is strictly forbidden.
- **Authentication Tag**: 128 bits (16 bytes), verifying ciphertext authenticity and preventing chosen-ciphertext tampering.
- **Additional Authenticated Data (AAD)**: Contextually bound metadata (`bb:<recordId>:<fieldName>`) ensuring ciphertext cannot be transplanted across database records or fields.

### 3.2 Envelope Format
Encrypted fields can be stored either as structured JSON (`EncryptedEnvelope`) or serialized compact strings:
```
enc:v1:<keyId>:<iv_hex>:<tag_hex>:<ciphertext_hex>
```
Example:
```
enc:v1:bb-enc-v1:a1b2c3d4e5f60718293a4b5c:f0e1d2c3b4a5968778695a4b3c2d1e0f:8a9b0c...
```

### 3.3 Integrity and Fail-Closed Verification
Decryption via `decryptSensitiveField` verifies:
1. Envelope header version (`v1`).
2. Key ID existence in the active key provider.
3. IV length (strictly 12 bytes).
4. Tag length (strictly 16 bytes).
5. GCM authentication tag verification (`decipher.setAuthTag(tag)`).
6. Exact AAD context match (`bb:<recordId>:<fieldName>`).

If any byte is tampered with (IV, tag, ciphertext, or AAD), decryption fails immediately by throwing a `DecryptionError` without returning partially decrypted data.

### 3.4 Searchable Fields and Index Preservation
- Identifiers required for roll indexing and fast constituency lookup (`simulationVoterId`, `legacyEpicId`, `constituencyId`) remain unencrypted to avoid performance degradation and breaking Firestore equality filters (`where('simulationVoterId', '==', ...)`).
- Pseudonymous simulation IDs (`BBV-SIM-...`) are used in place of direct personal identifiers.
- Highly confidential PII (contact details, unmasked notes) use authenticated field encryption.

### 3.5 Migration Strategy
The `migrateField` utility provides an explicit migration pathway:
- Plaintext records are identified without silent reinterpretation.
- Dry-run capability (`dryRun: true`) allows assessing required migrations without altering data.
- Already-encrypted records using old keys can be re-encrypted to the primary key during key rotation without downtime.

---

## 4. Cryptographic Key and Secret Management

### 4.1 Typed Key Provider Architecture
The system employs an extensible `IKeyProvider` interface:
```typescript
export interface IKeyProvider {
  getPrimaryKey(): Promise<EncryptionKey>;
  getKey(keyId: string): Promise<EncryptionKey | null>;
  listKeys(): Promise<KeyMetadata[]>;
  rotateKey?(newKey: Buffer, newKeyId?: string): Promise<KeyMetadata>;
}
```

The default implementation, `LocalKeyProvider`:
- Parses primary and secondary encryption keys from environment configuration (`APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY_ID`, `APP_ENCRYPTION_KEY_FALLBACKS`).
- Derives 32-byte keys using SHA-256 if passphrase-style strings are supplied.
- Supports multi-key rotation: old keys remain available for decryption, while new writes use the designated primary key.
- Validates key identifiers and versions.

### 4.2 Production Security Invariants
- **No Production Secrets in Git**: Git tracking ignores `.env`, `.env.local`, and credential files.
- **Fail-Closed Startup Validation**: In `NODE_ENV=production`, `validateServerConfig()` strictly checks:
  1. `APP_ENCRYPTION_KEY` is configured and at least 32 bytes.
  2. Test/dummy keys (such as `0x0123456789abcdef...` or `0x000000...`) are rejected.
  3. Authorization signer private key is present and matches the deployed contract.
  4. Firebase service account credentials are valid.
- **Key Separation**: Encryption keys are never stored in Firestore collections alongside ciphertext, never transmitted to the frontend bundle, and never printed in logs or error traces.
- **Production KMS Recommendation**: In production cloud environments (GCP/AWS/Azure), `IKeyProvider` should be backed by a managed HSM or KMS provider (e.g., Google Cloud KMS, AWS KMS, HashiCorp Vault) using envelope encryption.

---

## 5. Transport and Database Access Boundaries

### 5.1 Transport Security
- **Strict-Transport-Security (HSTS)**: Configured in production with `max-age=31536000; includeSubDomains`.
- **CORS Boundary**: In production, CORS strictly enforces the configured `APP_URL`, rejecting arbitrary cross-origin invocations. In development, loopback addresses (`localhost`, `127.0.0.1`) are permitted.
- **Security Headers**: Includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and strict `Referrer-Policy`.

### 5.2 Firestore Security Boundaries
Firestore security rules (`firestore.rules`) enforce zero trust against client SDK access:
- `manual_id_exceptions`: `allow read, write: if false;` (Server-only via Firebase Admin SDK).
- `voting_sessions`: `allow read, write: if false;` (Server-only).
- `ballots`: Restricted to administrative verification or signed receipts (`allow read: if isAdmin() || isSignedIn(); allow write: if false;`).
- `audit_events`: Read-only for authorized clients; writes restricted to server Admin SDK.

---

## 6. Voter Privacy and Data Minimization

### 6.1 Data Minimization at API Boundaries
- **Prohibited Field Rejection**: Incoming request payloads across voter verification, OTP verification, authorization, and ballot recording are scanned via `validateNoProhibitedFields()`. Any payload containing raw biometrics (`rawBiometric`, `faceImage`, `fingerprintTemplate`), document scans, private keys, or credentials is immediately rejected with HTTP 400.
- **PII Masking**:
  - Phone numbers are masked: `+91 9823412345` -> `+91 98*** **345`.
  - Email addresses are masked: `voter.delhi@example.gov.in` -> `v***i@example.gov.in`.
  - EPIC IDs in non-privileged responses are masked: `IND-DL-982341` -> `IND-**-***341`.
- **Sanitized Logging**: All audit events and structured logs pass through `sanitizeLogData()`, which redacts tokens, secrets, passwords, private keys, and candidate selections before output.
- **Transient Biometric Previews**: Web camera frames and fingerprint preview data exist strictly in client memory during the live capture session and are never transmitted to server endpoints.

---

## 7. Critical Finding: Ballot Confidentiality on the Blockchain

### 7.1 Empirical Investigation of Current EVM Contract
An inspection of `contracts/IndianElection.sol`, the contract ABI, transaction builders, and emitted events reveals that **ballot confidentiality is not achieved on the public EVM layer**:

1. **Plaintext Calldata Exposure**:
   ```solidity
   function castVote(
       uint256 _electionId,
       uint256 _constituencyId,
       uint256 _candidateId,
       bytes32 _nullifier,
       uint256 _expiry,
       bytes calldata _signature
   ) external
   ```
   `_candidateId` is passed directly in calldata. Any EVM node, mempool observer, or block explorer observes the candidate ID in plaintext immediately upon transaction broadcast.

2. **Real-Time Tally Disclosure in Public State**:
   ```solidity
   candidates[_electionId][_constituencyId][_candidateId].voteCount += 1;
   election.totalVotes += 1;
   ```
   Every transaction increments a public candidate counter. Observers can inspect contract state changes between blocks to identify which candidate received a vote.

3. **Public Event Disclosure**:
   ```solidity
   emit VoteCast(_electionId, _constituencyId, _candidateId, _nullifier, msg.sender);
   ```
   The `VoteCast` event explicitly binds `_candidateId` to `msg.sender` (`voterWallet`). If the voter's Ethereum address is linkable to their identity (e.g., funding source, IP address, KYC on-ramp), voter anonymity is entirely compromised.

4. **Nullifiers Address Double-Voting, Not Ballot Confidentiality**:
   The `_nullifier` prevents double-voting by burning upon use (`spentNullifiers[_electionId][_nullifier] = true`). It does **not** conceal the candidate choice.

5. **Simple Hashing Does Not Solve Ballot Secrecy**:
   Because candidate IDs in any constituency are small integers (typically 1 to 15), simple hashing (`keccak256(candidateId)`) has a keyspace of under 20 values, making it trivially vulnerable to rainbow-table and brute-force discovery.

---

## 8. Phase 13 Release Blocker: Ballot Confidentiality

> [!CAUTION]
> ### RELEASE-BLOCKING LIMITATION
> **Blocker ID**: `BB-SEC-PH09-BALLOT-SECRECY`
> **Severity**: CRITICAL
> **Status**: UNRESOLVED ON-CHAIN — MANDATORY BLOCKER FOR RELEASE (PHASE 13)
>
> **Reason**: In `contracts/IndianElection.sol`, `castVote` receives `_candidateId` as plaintext calldata, modifies per-candidate public storage counters, and emits `VoteCast` containing `_candidateId` alongside `msg.sender`.
>
> **Why Ad-Hoc Solutions Are Rejected**:
> - Simple hashing is vulnerable to dictionary attacks due to low entropy.
> - Symmetric encryption (AES) with a server key requires a central decryption server, creating a single point of failure and coercion.
> - Homemade zero-knowledge proofs or ad-hoc homomorphic algorithms are insecure and violate cryptographic safety principles.
>
> **Required Architectural Remedy Before Phase 13**:
> 1. Integration of a battle-tested private voting protocol:
>    - **Semaphore / MACI (Minimum Anti-Collusion Infrastructure)** using zk-SNARKs for identity concealment and encrypted message queues.
>    - **ElGamal threshold encryption** or Paillier additive homomorphic tallying, where individual votes remain encrypted and tallying requires a distributed threshold committee.
>    - **Commit-Reveal Schemes with Shuffled Mixing**: Encrypted commitments during voting followed by a verifiable mixnet before tallying.
> 2. Relayer / Account Abstraction infrastructure to decouple `msg.sender` from the voter's personal wallet.
>
> **Until this cryptographic enhancement is formally implemented, peer-reviewed, and tested, BlockBallot must not be deployed to public mainnets or described as providing secret ballot voting.**

---

## 9. Threat Model & Operational Security Boundaries

### 9.1 Protected Against
- **Tampering with Stored Records**: AES-256-GCM authentication tags and AAD context binding prevent database manipulation or record transplantation.
- **Database Eavesdropping**: Field-level encryption conceals sensitive contact details at rest in Firestore.
- **Client SDK Enumeration**: Firestore rules deny unauthorized client SDK access to sessions, exceptions, and audit logs.
- **Payload Injection of Biometrics/Secrets**: Boundary validators reject unexpected biometric data and private credentials.
- **Replay Attacks**: Single-use OTP HMAC challenges, server-authoritative session locks, and cryptographic nullifiers prevent replay.
- **Data Leakage in Logs**: Automated redaction sanitizes tokens, passwords, and secrets from application logs.

### 9.2 Outside Current Academic Threat Model
- **Compromised Host / Memory Dumps**: If the Node.js server memory is compromised, in-memory keys and active sessions could be extracted. Production requires hardware isolation (Enclaves / confidential VMs).
- **Public EVM Mempool Eavesdropping**: Plaintext candidate IDs on EVM are observable as detailed in Section 7.
- **Client Device Malware**: Keyloggers or screen recorders on voter personal devices are outside server control. Supervised kiosk recovery provides partial mitigation.
