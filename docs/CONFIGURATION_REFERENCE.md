# BlockBallot — Configuration Reference Guide

> [!IMPORTANT]
> **Academic Prototype & Safe Configuration Standards**
> This document specifies all environment variables used by the BlockBallot platform across local development, Firestore emulator testing, staging, and production.
> **Never commit real credentials, private keys, or API tokens to source control.**

---

## 1. Environment Variable Specification

| Variable Name | Required In | Type / Format | Default (Dev / Test) | Description & Security Policy |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | All | Enum (`development` \| `test` \| `production`) | `development` | Dictates server mode. In `production`, strict fail-closed validation activates. |
| `PORT` | Optional | Integer (`1024-65535`) | `3000` | Port for Express API server and Vite middleware integration. |
| `APP_URL` | Production | URL (`https://...`) | None (Local loopback permitted in dev) | Canonical frontend origin for strict CORS policy enforcement in production. |
| `SERVER_AUTHORIZATION_SIGNER_KEY` | Production | 66-char Hex (`0x[0-9a-fA-F]{64}`) | Dedicated deterministic demo key | Server ECDSA private key used to sign EIP-712 `VotingAuthorization` tickets. **Deterministic dev keys and Hardhat keys are strictly rejected in production.** |
| `SERVER_HMAC_SECRET` | Production | High-entropy string ($\ge 32$ chars) | Prototype fallback secret | Secret key used for server-side HMAC-SHA256 hashing of OTP verification challenges. |
| `SERVER_COMMITMENT_SALT` | Production | High-entropy string ($\ge 32$ chars) | Prototype fallback salt | Server salt used in pseudonymous voter nullifier derivation: `HMAC-SHA256(epicId + electionId, salt)`. |
| `FIRESTORE_DATABASE_ID` | Production / Staging | String | `(default)` | Target Firestore Database identifier. Default root database is `(default)`. |
| `GCLOUD_PROJECT` / `FIREBASE_PROJECT_ID` | Production / Staging | String | `e-voting-system-india` | Google Cloud / Firebase project identifier. |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Optional | JSON string or file path | None (Uses Application Default Credentials if absent) | Service account credentials with least-privilege Firestore and Firebase Auth permissions. |
| `FIRESTORE_EMULATOR_HOST` | Emulator Testing | `host:port` (e.g. `127.0.0.1:8088`) | None | When present, directs Firebase Admin SDK and Client SDK to the hermetic local Firestore Emulator. |
| `ALLOW_PUBLIC_DEPLOYMENT` | Deployments | Boolean (`true` \| `false`) | `false` | Deployment safety guard. When deploying to a non-local chain (not 31337 or 1337), `deployContract()` aborts unless this is explicitly set to `true`. |
| `DEPLOYER_PRIVATE_KEY` | Remote Deployments | 66-char Hex | Hardhat Account #0 | Ethereum private key used by deployment scripts to deploy `IndianElection.sol`. Hardhat Account #0 is blocked on non-local networks. |

---

## 2. Configuration Profiles

### A. Local Development Profile (`.env.local`)
Designed for standalone local experimentation with zero external cloud dependencies:
```bash
NODE_ENV=development
PORT=3000
# Signer key and HMAC fall back to deterministic academic demo keys automatically
# FIRESTORE_EMULATOR_HOST=127.0.0.1:8088 (optional if running local emulator)
```

### B. Local Firestore Emulator Profile
Used for hermetic testing with persistent Firestore security rules without contacting Google Cloud:
```bash
NODE_ENV=test
FIRESTORE_EMULATOR_HOST=127.0.0.1:8088
FIRESTORE_DATABASE_ID=(default)
GCLOUD_PROJECT=demo-blockballot
FIREBASE_PROJECT_ID=demo-blockballot
```

### C. Controlled Staging Profile
For a future staging environment on dedicated test infrastructure:
```bash
NODE_ENV=production
PORT=3000
APP_URL=https://staging-vote.blockballot.ac.in
FIRESTORE_DATABASE_ID=(default)
GCLOUD_PROJECT=staging-blockballot-demo
FIREBASE_PROJECT_ID=staging-blockballot-demo
# Must be generated from secure KMS or secret store; NEVER committed:
SERVER_AUTHORIZATION_SIGNER_KEY=0x<HIGH_ENTROPY_64_HEX_CHARS>
SERVER_HMAC_SECRET=<HIGH_ENTROPY_MIN_32_CHAR_STRING>
SERVER_COMMITMENT_SALT=<HIGH_ENTROPY_MIN_32_CHAR_STRING>
ALLOW_PUBLIC_DEPLOYMENT=false
```

---

## 3. Production Fail-Closed Rules

When `NODE_ENV=production`:
1. **Missing Secrets Abort Startup**: If `SERVER_AUTHORIZATION_SIGNER_KEY`, `SERVER_HMAC_SECRET`, or `SERVER_COMMITMENT_SALT` is absent, `validateServerConfig()` returns fatal errors and the server immediately exits (`process.exit(1)`).
2. **Known Test Key Rejection**: Any attempt to use the following test keys causes an immediate crash:
   * Deterministic dev key: `0x2a8714...ff82a5`
   * Hardhat test accounts #0 through #3 (`0xac0974...`, `0x59c699...`, etc.)
3. **Contract Signer Alignment**: The server derives the public address from `SERVER_AUTHORIZATION_SIGNER_KEY` and compares it to `src/contracts/deployment.json`. A mismatch triggers a critical startup failure.
4. **Mock Injection Prohibitions**: In `server/firebaseAdmin.ts`, calls to `setAdminTokenVerifierForTesting()` or `setAdminFirestoreForTesting()` throw fatal `SECURITY VIOLATION` exceptions in production.
5. **CORS Enforcement**: Only requests from the explicitly configured `APP_URL` are permitted; wildcard and arbitrary origins are rejected.
