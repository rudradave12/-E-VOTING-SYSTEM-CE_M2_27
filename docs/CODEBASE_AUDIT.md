# BlockBallot — Comprehensive Codebase Audit & Baseline Evaluation

**Document ID**: `DOC-BB-AUDIT-2026-001`  
**Target Repository**: `rudradave12/blockballot-e-voting-system`  
**Active Working Branch**: `feature/simulation-voter-registry-rbac`  
**Baseline Commit**: `4f3fb01` (`test(security): complete final audit and release readiness review`)  
**Evaluation Standard**: Professional Codebase Restructuring, Optimization & Quality Assurance  
**Date**: October 2026  

---

## 1. Executive Summary & Audit Context

This document records the initial static, dynamic, architectural, and operational audit of the BlockBallot repository following the completion of Phase 13. BlockBallot is an academic e-voting simulation prototype composed of a React 19 frontend (Vite 8), an authoritative Node.js/Express backend (TypeScript), a Firebase Firestore persistence layer (with in-memory fallback), and an Ethereum EVM smart contract (`contracts/IndianElection.sol`) deployed via Hardhat.

The repository was verified on branch `feature/simulation-voter-registry-rbac` with a clean working tree at commit `4f3fb01`. The full test suite passed 324/328 tests (4 skipped conditionally) in ~53.15 seconds, and the Phase 13 final security audit passed 26/26 tests across all 25 specific security workflows.

---

## 2. Existing Architecture & Major Entrypoints

### 2.1 Major Entrypoints
* **Full-Stack Application Server**: [`server.ts`](file:///e:/Projects/BlockBallot-EVoting-System/server.ts)  
  Starts Express on port 3000 (or `PORT`), mounts API routers under `/api/`, initializes Firestore background synchronization, applies HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Options), and integrates Vite middleware in development or serves `dist/` in production.
* **Frontend Web Application**: [`src/main.tsx`](file:///e:/Projects/BlockBallot-EVoting-System/src/main.tsx) & [`src/App.tsx`](file:///e:/Projects/BlockBallot-EVoting-System/src/App.tsx)  
  Mounts the React 19 root, initializes `LanguageProvider`, and manages navigation state across the 28 screens, including fullscreen kiosk containment and supervisor session unlocks.
* **Smart Contract Layer**: [`contracts/IndianElection.sol`](file:///e:/Projects/BlockBallot-EVoting-System/contracts/IndianElection.sol)  
  Solidity `^0.8.20` contract managing elections, constituencies, candidates, EIP-712 typed signature verification, and nullifier burning.
* **Blockchain Node & Deployer**: [`hardhat.config.cjs`](file:///e:/Projects/BlockBallot-EVoting-System/hardhat.config.cjs) & [`scripts/deploy.ts`](file:///e:/Projects/BlockBallot-EVoting-System/scripts/deploy.ts)  
  Hardhat configuration for local EVM node (`chainId: 31337`) and automated deployment.

### 2.2 Current Folder Structure
```text
BlockBallot-EVoting-System/
├── artifacts/                        # Hardhat compilation artifacts (git-tracked)
├── cache/                            # Hardhat compile cache (git-tracked)
├── contracts/                        # Solidity smart contract source
│   └── IndianElection.sol
├── data/
│   └── historical/                   # Verified historical election datasets
│       └── eci_2024_general_election.json
├── dist/                             # Compiled client bundle (gitignored)
├── docs/                             # 26 documentation files + benchmarks
├── node_modules/                     # Installed dependencies (gitignored)
├── scripts/                          # 9 operational, migration, and test scripts
├── server/                           # Backend Node.js / Express code
│   ├── auth/                         # RBAC, token issuance, session checks
│   ├── repositories/                 # Firestore & InMemory repository implementations
│   ├── routes/                       # Express route controllers (voter, admin, archive, etc.)
│   ├── security/                     # AES-256-GCM encryption, data minimization
│   ├── services/                     # Archive importer, public monitor service
│   ├── config.ts                     # Fail-closed server environment configuration
│   ├── crypto.ts                     # Backend cryptographic helpers
│   ├── firebaseAdmin.ts              # Firebase Admin SDK initialization
│   ├── firestore.ts                  # Legacy Firestore helper methods
│   └── store.ts                      # Centralized in-memory session and cache store
├── src/                              # Frontend React 19 application
│   ├── components/                   # UI components, navbar, emblem, banner
│   │   ├── common/                   # Reusable modals and symbols
│   │   └── screens/                  # 28 screen components (including obsolete screens)
│   ├── context/                      # React Context providers (LanguageContext)
│   ├── contracts/                    # Deployment address reference (deployment.json)
│   ├── data/                         # Static simulation datasets (historical2024.ts, mockData.ts)
│   ├── lib/                          # Client-side Firebase configuration
│   ├── services/                     # Frontend API clients (biometricService.ts, voterApi.ts)
│   ├── test/                         # Node Native Test Runner suites (27 test files)
│   ├── types/                        # TypeScript type definitions (archive, dataModel, index, etc.)
│   ├── utils/                        # Frontend crypto and EVM simulator
│   ├── App.tsx                       # Main screen router and orchestrator
│   ├── index.css                     # Global styles and Tailwind v4 theme
│   └── main.tsx                      # Vite React entrypoint
├── .env.example                      # Documented environment template
├── .env.local                        # Local environment overrides (gitignored)
├── .firebaserc                       # Firebase project configuration
├── .gitignore                        # Git ignore patterns
├── firebase.json                     # Firebase emulator and Firestore configuration
├── firestore.rules                   # Firestore security rules (referenced by tests and firebase.json)
├── hardhat.config.cjs                # Hardhat configuration
├── index.html                        # HTML entry template
├── package.json                      # Project dependencies and npm scripts
├── render.yaml                       # Cloud deployment blueprint
├── server.ts                         # Main application server entrypoint
├── tsconfig.json                     # TypeScript compiler configuration
└── vite.config.ts                    # Vite build configuration
```

---

## 3. Code Duplication & Dead-Code Findings

### 3.1 Obsolete Screen Components
1. **`src/components/screens/WelcomeScreen.tsx`**:
   - *Status*: **Dead Code**.
   - *Evidence*: `WelcomeScreen` was the initial landing screen before the UX redesign in Phase 12 introduced `HomeScreen.tsx`. In `src/App.tsx`, both `currentScreen === 'welcome'` and `currentScreen === 'home'` render `<HomeScreen />`. `WelcomeScreen` is imported in `App.tsx` but never rendered anywhere, and is unreferenced in all test suites.
2. **`src/components/screens/ResultsScreen.tsx`**:
   - *Status*: **Dead Code**.
   - *Evidence*: `ResultsScreen` was the initial basic results screen. In Phase 12, `ElectionsResultsScreen.tsx` was implemented to provide comprehensive tabbed views (live simulation results + 2024 Lok Sabha official gazette archive). In `App.tsx`, `currentScreen === 'results'` renders `<ElectionsResultsScreen />`. `ResultsScreen` is imported in `App.tsx` but never rendered, and is unreferenced in all test suites.

### 3.2 Unused Dependencies
1. **`motion` (`^12.23.24`)**:
   - Listed under `dependencies` in `package.json`.
   - Audit found 0 imports (`from 'motion'` or `from 'framer-motion'`) in `src/` or `server/`. UI animations are driven by Tailwind CSS utilities and `@keyframes`.
2. **`autoprefixer` (`^10.4.21`)**:
   - Listed under `devDependencies` in `package.json`.
   - Tailwind CSS v4 (`@tailwindcss/vite`) uses Lightning CSS internally with built-in vendor prefixing, making standalone `autoprefixer` redundant.

### 3.3 Duplicate Scope Functions (Resolved in Phase 13)
* `isConstituencyInScope` and `isElectionInScope` were previously duplicated/imported across `server/auth/rbac.ts` and UI enrollment screens, pulling Node packages into client bundles. This was centralized in `src/types/permissions.ts`.

---

## 4. Known Build, Dependency & Testing Issues

1. **Vite Deprecation Notice**:
   ```
   (!) Your Vite config uses features that are unsupported by `configLoader: 'native'`:
     - __dirname (vite.config.ts:11:27). Use `import.meta.dirname` instead
   ```
   *Impact*: Minor deprecation warning; easily fixed by migrating to `import.meta.dirname` or resolving with ES module standards.
2. **Monolithic Bundle Warning**:
   ```
   (!) Some chunks are larger than 500 kB after minification. (dist/assets/index-4jz2sGuL.js is 1,343.91 kB)
   ```
   *Impact*: Frontend JavaScript bundle contains all administrative screens, historical archive datasets, and blockchain libraries in a single file without code splitting.
   *Proposed Resolution*: Configure Rollup manual chunking in `vite.config.ts` to separate vendor dependencies (`react`, `react-dom`, `lucide-react`, `ethers`) and lazy-load administrative/monitor screens.
3. **Emulator Test Script Quoting in `package.json`**:
   * Windows PowerShell escapes quotes in npm scripts differently (`"tsx --test ..."` vs `'tsx --test ...'`).

---

## 5. Data Storage & Historical Data Architecture

### 5.1 Data Segregation
* **Active Simulation Data**: Kept in memory (`server/store.ts`) and synchronized with Firestore collections (`elections`, `voter_profiles`, `biometric_enrollments`, `voting_sessions`, `manual_id_exceptions`).
* **Canonical Historical Source**: [`data/historical/eci_2024_general_election.json`](file:///e:/Projects/BlockBallot-EVoting-System/data/historical/eci_2024_general_election.json) containing 11 certified Lok Sabha 2024 constituencies (New Delhi, Chandni Chowk, Varanasi, Lucknow, Wayanad, Bangalore South, Gandhinagar, Mumbai South, Chennai Central, Kolkata Uttar, Surat) with complete candidate breakdowns, Form 20 figures, and ECI provenance citations.
* **Frontend Historical Projection**: [`src/data/historical2024.ts`](file:///e:/Projects/BlockBallot-EVoting-System/src/data/historical2024.ts) providing typed structures, reserved party symbol metadata, and batch import specifications.

---

## 6. External Navigation & Outbound Redirect Inventory

The audit identified external outbound links that redirect users away from BlockBallot rather than presenting available content internally:

| Component | Line(s) | Current Target | Outbound Destination | Desired Internal Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `ElectionsResultsScreen.tsx` | L424 | `<a>` button | `results.eci.gov.in/...` | Switch to internal Historical Archive tab or trigger `onNavigateToArchive()` |
| `CandidatesPartiesScreen.tsx`| L101 | `<a>` button | `eci.gov.in/list-of-political-parties/` | Switch to local 'PARTIES' tab (already displays recognized parties and symbols) |
| `ConstituencyInfoScreen.tsx` | L143 | `<a>` button | `results.eci.gov.in/...` PDF | Open internal Form 20 Gazette summary modal displaying certified votes and provenance |
| `HistoricalArchiveScreen.tsx`| L611 | `<a>` button | `results.eci.gov.in/...` PDF | Open internal Form 20 Gazette modal displaying certified votes and provenance |
| `HistoricalArchiveScreen.tsx`| L658 | `<a>` button | `affidavit.eci.gov.in` | Open internal Candidate Affidavit modal displaying education, assets, criminal cases, and ECI citation |
| `CandidatesPartiesScreen.tsx`| L315 | `<a>` button | `affidavit.eci.gov.in` | Open internal Candidate Affidavit modal displaying education, assets, criminal cases, and ECI citation |

---

## 7. Performance Issues & Measurements

### Baseline Measurements (Phase 13 Baseline: `4f3fb01`)
* **TypeScript Compilation (`tsc --noEmit`)**: 0 errors (~1.8 seconds).
* **Production Build (`vite build`)**:
  - `dist/index.html`: 1.67 kB (gzip: 0.71 kB)
  - `dist/assets/index-Q0Gs9WIs.css`: 85.98 kB (gzip: 13.87 kB)
  - `dist/assets/index-4jz2sGuL.js`: **1,343.91 kB** (gzip: 364.58 kB)
  - Total Build Duration: ~735 ms.
  - Chunk warnings: 1 warning (> 500 kB).
* **Automated Regression Suite (`npm test`)**: 324 passed, 0 failed, 4 skipped in **53.15 seconds**.
* **Phase 13 Final Security Audit (`npx tsx --test ...`)**: 26 passed, 0 failed in **4.39 seconds**.

---

## 8. Proposed Changes & Risk Assessment

| Proposed Action | Technical Details | Risk Level | Mitigation |
| :--- | :--- | :--- | :--- |
| **1. Remove Obsolete Dead Screens** | Retire `WelcomeScreen.tsx` and `ResultsScreen.tsx`; remove unused imports from `App.tsx`. | **Low** | Verified that neither screen is referenced by any of the 324 tests or rendered in `App.tsx`. |
| **2. Remove Unused Dependencies** | Remove `motion` from `package.json` dependencies. | **Low** | 0 usages in codebase; verified through comprehensive grep search. |
| **3. Fix Vite Config Deprecation** | Update `__dirname` to `import.meta.dirname` in `vite.config.ts`. | **Very Low** | Standard Node.js ES module property. |
| **4. Implement Bundle Chunking** | Configure Rollup `manualChunks` in `vite.config.ts` for `vendor-react`, `vendor-icons`, and `vendor-crypto`. | **Low** | Verify that build compiles cleanly and chunk size drops below 500 kB. |
| **5. Internalize External Redirects** | Replace outbound redirects in `HistoricalArchiveScreen`, `ElectionsResultsScreen`, `CandidatesPartiesScreen`, and `ConstituencyInfoScreen` with internal modals/navigation. | **Medium** | Retain original source URLs as non-clickable provenance metadata/citations. |
| **6. Add Database Directory Resources** | Create `database/rules/firestore.rules` and `database/README.md`, retaining root `firestore.rules` for tests and Firebase CLI. | **Very Low** | Tests expecting root `firestore.rules` continue to pass without alteration. |
| **7. Organize Code into Feature Structure** | Establish clean feature directories (`src/features/`) while retaining stable component entrypoints. | **Medium** | Use backward-compatible index re-exports so existing tests using `path.resolve` continue to pass. |

---

**Audited by**: BlockBallot Lead Security Auditor & Architecture Pair  
**Repository**: `rudradave12/blockballot-e-voting-system`  
**Branch**: `feature/simulation-voter-registry-rbac`
