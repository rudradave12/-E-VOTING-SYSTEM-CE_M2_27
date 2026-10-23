# BlockBallot — Security Model, Threats & Academic Limitations

> [!CAUTION]
> **Academic Prototype Notice & Limitations Summary**  
> BlockBallot demonstrates cryptographic e-voting primitives for research and educational purposes.  
> * It is **NOT** a legally certified Indian voting system.  
> * It does **NOT** interface with live ECI/UIDAI national databases.  
> * It provides **pseudonymous duplicate-vote prevention**, not zero-knowledge secret voting.

---

## 1. Security Architecture & Threat Model

```
┌────────────────────────────────────────────────────────────────────────┐
│                        THREAT MODEL & MITIGATIONS                      │
├───────────────────────────────┬────────────────────────────────────────┤
│ Potential Threat              │ Architectural Mitigation               │
├───────────────────────────────┼────────────────────────────────────────┤
│ 1. Double Voting              │ Dual protection: On-chain nullifier    │
│    (Same elector votes twice) │ burning + off-chain voter state guard. │
├───────────────────────────────┼────────────────────────────────────────┤
│ 2. Elector Roll Enumeration   │ Generic responses on unverified EPIC   │
│    (Scraping valid voter IDs) │ lookups + 60s cooldown per identity.   │
├───────────────────────────────┼────────────────────────────────────────┤
│ 3. OTP Brute-Force            │ Server-side HMAC comparison, 5-minute  │
│    (Guessing 6-digit codes)   │ expiry, and hard 3-attempt lockout.    │
├───────────────────────────────┼────────────────────────────────────────┤
│ 4. Ticket Forgery / Tampering │ EIP-712 typed data signatures verified │
│    (Altering constituency/ID) │ cryptographically in Solidity.         │
├───────────────────────────────┼────────────────────────────────────────┤
│ 5. Front-Running / Relay      │ EIP-712 ticket binds strictly to       │
│    (Stealing another's ticket)│ voter's wallet address (`msg.sender`). │
├───────────────────────────────┼────────────────────────────────────────┤
│ 6. Out-of-Window Submissions  │ Smart contract enforces block.timestamp│
│    (Voting before/after time) │ between election startTime and endTime.│
├───────────────────────────────┼────────────────────────────────────────┤
│ 7. Production Key Leakage     │ Startup fails closed; test keys rejected│
│    (Hardhat test keys in prod)│ automatically in production mode.      │
└───────────────────────────────┴────────────────────────────────────────┘
```

---

## 2. Cryptographic Specifications

### A. EIP-712 Typed Structured Data Signing
* **Domain Separator**:
  ```typescript
  const domain = {
    name: "BlockBallot",
    version: "1",
    chainId: 31337, // Local testnet or staging chainId
    verifyingContract: contractAddress
  };
  ```
* **Type Definition**:
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

### B. Pseudonymous Nullifier Derivation
The server derives a deterministic, pseudonymous nullifier for each voter-election pair using a high-entropy commitment salt:
$$\text{Nullifier} = \text{HMAC-SHA256}(\text{epicId} \parallel \text{electionId}, \text{SERVER\_COMMITMENT\_SALT})$$
This ensures that:
1. The nullifier is unique to that election and cannot be linked across elections.
2. The voter cannot cast a second ballot with the same nullifier.
3. The voter's real identity (`epicId`) cannot be extracted from the nullifier without the server's private salt.

---

## 3. Explicit Academic Limitations & Open Challenges

### Limitation 1: Calldata Transparency (No Ballot Secrecy)
In `IndianElection.sol`, the candidate selection is passed as plaintext argument `_candidateId` to `castVote(...)`.
* **Impact**: Anyone inspecting Ethereum block logs or pending mempool transactions can see the selected candidate.
* **Academic Future Work**: Implementing Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge (zk-SNARKs) or homomorphic encryption (e.g., Paillier cryptosystem) to tally votes without decrypting individual ballots.

### Limitation 2: Operator Correlation Risk
Because the server-side authorization engine validates the voter's identity and generates the nullifier, a malicious or compromised database administrator with access to both database logs and blockchain transactions could theoretically correlate an elector's session with their on-chain nullifier.
* **Mitigation in Prototype**: Server logs strictly omit linkable fields; authorization ticket issuance never receives the candidate choice; production database writes are protected.
* **Academic Future Work**: Adoption of threshold cryptography, verifiable mixnets, or decentralized blind signature authorities.

### Limitation 3: Synthetic Test Registries
All voter rolls in this repository use synthetic demographic records. Live production deployments in India would require integration with Aadhaar/UIDAI e-KYC or the ECI Electoral Roll Management System (ERMS), which are legally restricted government systems.
