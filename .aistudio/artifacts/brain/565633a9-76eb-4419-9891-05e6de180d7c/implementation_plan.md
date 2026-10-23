# BlockBallot — Indian Political Blockchain E-Voting System (Final Verified Implementation Plan)

BlockBallot is an **academic demonstration and research prototype** that demonstrates verifiable electronic voting for Indian parliamentary constituencies using React 19, TypeScript, Ethers.js, Solidity 0.8.x, and Firebase Firestore.

> [!CAUTION]
> **Academic Prototype & Privacy Limitations**:
> 1. **Academic Demonstration Only**: Operates strictly on synthetic voter records and mock electoral datasets. Does not interface with live ECI/UIDAI systems.
> 2. **Explicit Privacy Boundary**: BlockBallot provides **pseudonymous voting with duplicate-vote prevention**, **NOT** cryptographic unlinkability or formal Zero-Knowledge (ZK) anonymity.
> 3. **Operator Correlation Threat Vector**: Because the server-side authorization engine binds the voter's synthetic identity to an authorization ticket (and associated wallet address/nullifier), an authorized backend administrator or compromised database operator could correlate a voter identity with the public on-chain transaction. This limitation is acknowledged as an open challenge in academic electronic voting requiring specialized threshold cryptography or mixnets. Access to authorization logs is strictly restricted, and audit logging omits linkable fields.

---

### Final Implementation Corrections & Security Hardening

> [!IMPORTANT]
> The following six critical implementation refinements are standardized in this final specification:

1. **Standardized EIP-712 Typed Data Signatures**:
   - The contract inherits OpenZeppelin's `EIP712` and `ECDSA` contracts: `contract IndianElection is EIP712`.
   - Domain separator:
     ```typescript
     const domain = {
       name: "BlockBallot",
       version: "1",
       chainId: targetChainId,
       verifyingContract: contractAddress
     };
     ```
   - Type definitions:
     ```typescript
     const types = {
       VotingAuthorization: [
         { name: "electionId", type: "uint256" },
         { name: "constituencyId", type: "uint256" },
         { name: "voterWallet", type: "address" },
         { name: "nullifier", type: "bytes32" },
         { name: "expiry", type: "uint256" }
       ]
     };
     ```
   - Both server-side signer and client/contract use identical field types and hashing order.
2. **Idempotent Vote Confirmation & Reissuance Reconciliation**:
   - Before issuing any new voting authorization ticket to a voter in an uncertain or interrupted state, the backend explicitly queries the smart contract: `spentNullifiers(electionId, previousNullifier)`.
   - If the previous nullifier was spent on-chain, the server immediately marks the voter as `VOTED` and rejects reissuance.
   - If unspent and expired (or failed/reverted), a new ticket may be issued.
   - Prevents race conditions and double-voting across browser restarts and pending transactions.
3. **Hardened HMAC-SHA-256 OTP Verification Engine**:
   - OTP challenge hashes computed using `crypto.createHmac('sha256', SERVER_HMAC_SECRET).update(otp + epicId).digest('hex')`.
   - Stored in Firestore `/otp_challenges/{epicId}` with:
     - `attemptsRemaining`: Initialized to 3; decremented per incorrect guess.
     - `expiresAt`: Fixed 300s (5-minute) timestamp; rejected server-side immediately if `now > expiresAt`.
     - `isUsed`: Set to `true` atomically on successful verification.
     - `lastRequestedAt`: Enforces a mandatory 60-second rate-limiting cooldown.
4. **Transparent Identity-to-Ballot Privacy Boundaries**:
   - Documented operator correlation risks directly in UI and architecture docs.
   - Server-side memory-only ephemeral signing key or restricted KMS configuration.
   - Server logs never output voter identity together with wallet address or nullifier.
5. **Smart Contract Edge-Case Hardening**:
   - Validates that `electionId != 0`, `constituencyId != 0`, and `candidateId != 0`.
   - Prevents duplicate candidate registration (`candidates[electionId][constituencyId][candidateId].id == 0`).
   - Validates election time window: `require(block.timestamp >= election.startTime && block.timestamp <= election.endTime, "Election not in voting window")`.
   - Enforces strict state transitions:
     - `Draft` $\to$ `Active`
     - `Active` $\rightleftharpoons$ `Paused`
     - `Active` / `Paused` $\to$ `Concluded`
   - Validates that the target candidate belongs strictly to the requested constituency and election.
6. **Automated Verification Matrix (`tsx --test`)**:
   - Tests forged, tampered, and expired EIP-712 signatures.
   - Tests wrong-wallet and wrong-network (chainId) submission rejections.
   - Tests HMAC OTP attempt exhaustion, expiration, and rate-limiting.
   - Tests on-chain double-nullifier spending and candidate tally increments.
   - Tests idempotent reconciliation and recovery from failed transactions.

---

## 1. System Architecture & EIP-712 Typed Signing Workflow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        VOTER CLIENT BROWSER                            │
│ 1. Enter synthetic EPIC ID                                            │
│ 2. Enter 6-digit OTP                                                   │
│ 3. Connects MetaMask (or selects Simulated EVM)                       │
└──────────────────┬──────────────────────────────────┬──────────────────┘
                   │                                  │
      (1) EPIC & OTP Verification         (3) EIP-712 Signed Ballot
                   │                                  │
                   ▼                                  ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│       SERVER-SIDE ENGINE (server.ts) │ │ SMART CONTRACT (Solidity)     │
│ - Validates HMAC-SHA-256 OTP         │ │ - Inherits OpenZeppelin EIP712│
│ - Reconciles previous nullifiers     │ │ - Checks election time window │
│ - Signs EIP-712 VotingAuthorization  │ │ - Verifies EIP-712 signature  │
│   (electionId, constId, voterWallet, │ │ - msg.sender == voterWallet   │
│    nullifier, expiry)                │ │ - Checks !spentNullifiers     │
│ - Sets state: ELIGIBLE -> AUTHORIZED │ │ - Burns nullifier & tallies   │
│   (Zero candidate data received)     │ └───────────────────────────────┘
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│     CLOUD FIRESTORE PERSISTENCE      │
│ - /elections/{electionId}            │
│ - /constituencies/{constituencyId}   │
│ - /candidates/{candidateId}          │
│ - /voters/{voterId}                  │
│ - /otp_challenges/{epicId}           │
└──────────────────────────────────────┘
```

---

## 2. Hardened Solidity Contract (`IndianElection.sol`)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract IndianElection is EIP712 {
    using ECDSA for bytes32;

    enum ElectionStatus { Draft, Active, Paused, Concluded }

    struct ElectionData {
        uint256 id;
        string title;
        ElectionStatus status;
        uint256 startTime;
        uint256 endTime;
        uint256 totalVotes;
    }

    struct CandidateData {
        uint256 id;
        string name;
        string party;
        uint256 constituencyId;
        uint256 voteCount;
    }

    bytes32 private constant VOTING_AUTHORIZATION_TYPEHASH = keccak256(
        "VotingAuthorization(uint256 electionId,uint256 constituencyId,address voterWallet,bytes32 nullifier,uint256 expiry)"
    );

    address public electionCommissioner;
    address public authorizationSigner;

    mapping(uint256 => ElectionData) public elections;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => CandidateData))) public candidates;
    mapping(uint256 => mapping(uint256 => uint256[])) public constituencyCandidates;
    mapping(uint256 => mapping(bytes32 => bool)) public spentNullifiers;

    event ElectionCreated(uint256 indexed electionId, string title, uint256 startTime, uint256 endTime);
    event ElectionStatusChanged(uint256 indexed electionId, ElectionStatus indexed newStatus);
    event CandidateRegistered(uint256 indexed electionId, uint256 indexed constituencyId, uint256 indexed candidateId, string name, string party);
    event VoteCast(uint256 indexed electionId, uint256 indexed constituencyId, uint256 indexed candidateId, bytes32 nullifier);

    modifier onlyCommissioner() {
        require(msg.sender == electionCommissioner, "BlockBallot: Only Commissioner authorized");
        _;
    }

    constructor(address _authorizationSigner) EIP712("BlockBallot", "1") {
        require(_authorizationSigner != address(0), "BlockBallot: Invalid signer");
        electionCommissioner = msg.sender;
        authorizationSigner = _authorizationSigner;
    }

    function setAuthorizationSigner(address _newSigner) external onlyCommissioner {
        require(_newSigner != address(0), "BlockBallot: Invalid signer");
        authorizationSigner = _newSigner;
    }

    function createElection(
        uint256 _electionId,
        string calldata _title,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyCommissioner {
        require(_electionId != 0, "BlockBallot: Election ID cannot be 0");
        require(elections[_electionId].id == 0, "BlockBallot: Election already exists");
        require(_endTime > _startTime, "BlockBallot: End time must be after start time");

        elections[_electionId] = ElectionData({
            id: _electionId,
            title: _title,
            status: ElectionStatus.Draft,
            startTime: _startTime,
            endTime: _endTime,
            totalVotes: 0
        });
        emit ElectionCreated(_electionId, _title, _startTime, _endTime);
    }

    function setElectionStatus(uint256 _electionId, ElectionStatus _newStatus) external onlyCommissioner {
        ElectionData storage election = elections[_electionId];
        require(election.id != 0, "BlockBallot: Election does not exist");

        // Strict state machine validation
        if (_newStatus == ElectionStatus.Active) {
            require(election.status == ElectionStatus.Draft || election.status == ElectionStatus.Paused, "BlockBallot: Invalid state transition to Active");
        } else if (_newStatus == ElectionStatus.Paused) {
            require(election.status == ElectionStatus.Active, "BlockBallot: Can only pause an Active election");
        } else if (_newStatus == ElectionStatus.Concluded) {
            require(election.status == ElectionStatus.Active || election.status == ElectionStatus.Paused, "BlockBallot: Can only conclude Active or Paused election");
        } else {
            revert("BlockBallot: Invalid state transition");
        }

        election.status = _newStatus;
        emit ElectionStatusChanged(_electionId, _newStatus);
    }

    function registerCandidate(
        uint256 _electionId,
        uint256 _constituencyId,
        uint256 _candidateId,
        string calldata _name,
        string calldata _party
    ) external onlyCommissioner {
        require(elections[_electionId].status == ElectionStatus.Draft, "BlockBallot: Candidate registration only allowed in Draft");
        require(_constituencyId != 0 && _candidateId != 0, "BlockBallot: IDs cannot be 0");
        require(candidates[_electionId][_constituencyId][_candidateId].id == 0, "BlockBallot: Candidate ID already registered in constituency");

        candidates[_electionId][_constituencyId][_candidateId] = CandidateData({
            id: _candidateId,
            name: _name,
            party: _party,
            constituencyId: _constituencyId,
            voteCount: 0
        });
        constituencyCandidates[_electionId][_constituencyId].push(_candidateId);
        emit CandidateRegistered(_electionId, _constituencyId, _candidateId, _name, _party);
    }

    function castVote(
        uint256 _electionId,
        uint256 _constituencyId,
        uint256 _candidateId,
        bytes32 _nullifier,
        uint256 _expiry,
        bytes calldata _signature
    ) external {
        ElectionData storage election = elections[_electionId];
        require(election.status == ElectionStatus.Active, "BlockBallot: Election not active");
        require(block.timestamp >= election.startTime && block.timestamp <= election.endTime, "BlockBallot: Outside voting hours");
        require(block.timestamp <= _expiry, "BlockBallot: Authorization ticket expired");
        require(_nullifier != bytes32(0), "BlockBallot: Nullifier cannot be zero");
        require(!spentNullifiers[_electionId][_nullifier], "BlockBallot: Nullifier already spent");
        require(candidates[_electionId][_constituencyId][_candidateId].id != 0, "BlockBallot: Candidate not registered in this constituency");

        // Verify EIP-712 Typed Signature
        bytes32 structHash = keccak256(
            abi.encode(
                VOTING_AUTHORIZATION_TYPEHASH,
                _electionId,
                _constituencyId,
                msg.sender, // Strictly bounds to the transaction sender
                _nullifier,
                _expiry
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(hash, _signature);
        require(recoveredSigner == authorizationSigner, "BlockBallot: Invalid or forged EIP-712 voting authorization");

        // Burn nullifier and record tally
        spentNullifiers[_electionId][_nullifier] = true;
        candidates[_electionId][_constituencyId][_candidateId].voteCount += 1;
        election.totalVotes += 1;

        emit VoteCast(_electionId, _constituencyId, _candidateId, _nullifier);
    }
}
```

---

## 3. Persistent HMAC-SHA-256 OTP Challenge Schema

Stored in `/otp_challenges/{epicId}`:
```typescript
interface OtpChallengeDocument {
  epicId: string;
  hmacHash: string; // HMAC-SHA256(otp, SERVER_HMAC_SECRET)
  attemptsRemaining: number; // 3 -> 2 -> 1 -> 0 (locked)
  expiresAt: number; // Current time + 300_000 ms
  isUsed: boolean; // Marked true upon single-use redemption
  createdAt: number;
  lastRequestedAt: number; // Minimum 60,000 ms cooldown
}
```

---

## 4. Testing Matrix (`tsx --test`)

1. **`src/test/eip712.test.ts`**:
   - Validates correct EIP-712 struct hash calculation and signature recovery using Ethers.js.
   - Verifies rejection when `msg.sender != voterWallet`.
   - Verifies rejection when `block.timestamp > expiry`.
   - Verifies rejection when chainId or verifyingContract does not match.
2. **`src/test/otp_hmac.test.ts`**:
   - Validates HMAC-SHA-256 challenge generation and comparison.
   - Verifies attempt decrement and 3-attempt lockout.
   - Verifies rejection after expiration even if the document has not yet been garbage collected.
   - Verifies 60s request cooldown rate limit.
3. **`src/test/reconciliation.test.ts`**:
   - Simulates interrupted transaction: checks `spentNullifiers` before re-issuance.
   - Successfully reconciles and marks `VOTED` if transaction succeeded in background.
   - Allows clean re-authorization if previous transaction reverted or expired.
4. **`src/test/contract_guards.test.ts`**:
   - Tests zero-identifier rejection (`electionId=0`, `constituencyId=0`, `candidateId=0`).
   - Tests duplicate candidate rejection.
   - Tests election time-window validation (`before startTime` and `after endTime`).
   - Tests valid vs invalid status state transitions.

---

## 5. Firebase Pre-Provisioning Disclosures (Phase 3 Preparation)

Before initializing any Firebase resources:
- **Cloud Project ID**: Target project ID associated with this AI Studio applet instance (`axeeq27gtm2ckxhvxplrz4-407763797942` or user-specified ID).
- **Database Location**: Regional database location (e.g., `asia-south1` [Mumbai] or `asia-east1` [Tokyo]). Location choice is **permanent**.
- **Required Services**: Cloud Firestore (Database) & Firebase Authentication (Google Login).
- **Billing Tier**: Spark Free Tier (50,000 reads/day, 20,000 writes/day, 1GB data storage). No billing setup required.
