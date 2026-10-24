// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title IndianElection
 * @notice Production-grade academic smart contract for Indian parliamentary e-voting.
 * Implements EIP-712 typed data verification, constituency-level candidate registries,
 * strict state-machine lifecycle, and single-use cryptographic nullifier burning.
 */
contract IndianElection is EIP712 {
    enum ElectionStatus {
        Draft,
        Active,
        Paused,
        Concluded
    }

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

    address public electionCommissioner;
    address public authorizationSigner;

    // EIP-712 Typed Data Typehash matching off-chain signing engine exactly
    bytes32 public constant VOTING_AUTHORIZATION_TYPEHASH = keccak256(
        "VotingAuthorization(uint256 electionId,uint256 constituencyId,address voterWallet,bytes32 nullifier,uint256 expiry)"
    );

    // Election ID -> Election metadata
    mapping(uint256 => ElectionData) public elections;

    // Election ID -> Constituency ID -> Candidate ID -> CandidateData
    mapping(uint256 => mapping(uint256 => mapping(uint256 => CandidateData))) public candidates;

    // Election ID -> Constituency ID -> Candidate ID list
    mapping(uint256 => mapping(uint256 => uint256[])) private _constituencyCandidateIds;

    // Election ID -> Nullifier -> Spent status
    mapping(uint256 => mapping(bytes32 => bool)) public spentNullifiers;

    // Events for transparency and auditable logs
    event ElectionCreated(uint256 indexed electionId, string title, uint256 startTime, uint256 endTime);
    event ElectionStatusChanged(uint256 indexed electionId, ElectionStatus indexed newStatus);
    event CandidateRegistered(
        uint256 indexed electionId,
        uint256 indexed constituencyId,
        uint256 indexed candidateId,
        string name,
        string party
    );
    event VoteCast(
        uint256 indexed electionId,
        uint256 indexed constituencyId,
        uint256 indexed candidateId,
        bytes32 nullifier,
        address voterWallet
    );
    event AuthorizationSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event CommissionerTransferred(address indexed oldCommissioner, address indexed newCommissioner);

    modifier onlyCommissioner() {
        require(msg.sender == electionCommissioner, "BlockBallot: Only Commissioner authorized");
        _;
    }

    /**
     * @notice Initializes EIP-712 domain ("BlockBallot", "1") and sets commissioner and signer.
     */
    constructor(address _authorizationSigner) EIP712("BlockBallot", "1") {
        require(_authorizationSigner != address(0), "BlockBallot: Invalid signer");
        electionCommissioner = msg.sender;
        authorizationSigner = _authorizationSigner;
    }

    /**
     * @notice Updates the EIP-712 voting authorization signer address.
     */
    function setAuthorizationSigner(address _newSigner) external onlyCommissioner {
        require(_newSigner != address(0), "BlockBallot: Invalid signer");
        address oldSigner = authorizationSigner;
        authorizationSigner = _newSigner;
        emit AuthorizationSignerUpdated(oldSigner, _newSigner);
    }

    /**
     * @notice Transfers election commissioner role.
     */
    function transferCommissioner(address _newCommissioner) external onlyCommissioner {
        require(_newCommissioner != address(0), "BlockBallot: Invalid commissioner");
        address old = electionCommissioner;
        electionCommissioner = _newCommissioner;
        emit CommissionerTransferred(old, _newCommissioner);
    }

    /**
     * @notice Registers a new election. Starts in Draft state.
     */
    function createElection(
        uint256 _electionId,
        string calldata _title,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyCommissioner {
        require(_electionId != 0, "BlockBallot: Election ID cannot be 0");
        require(bytes(_title).length > 0, "BlockBallot: Title cannot be empty");
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

    /**
     * @notice Enforces strict state transitions:
     * Draft -> Active
     * Active <-> Paused
     * Active/Paused -> Concluded (Terminal)
     */
    function setElectionStatus(uint256 _electionId, ElectionStatus _newStatus) external onlyCommissioner {
        ElectionData storage election = elections[_electionId];
        require(election.id != 0, "BlockBallot: Election does not exist");
        require(election.status != ElectionStatus.Concluded, "BlockBallot: Concluded election is terminal");
        require(election.status != _newStatus, "BlockBallot: Status already set");
        require(_newStatus != ElectionStatus.Draft, "BlockBallot: Cannot transition back to Draft");

        if (_newStatus == ElectionStatus.Active) {
            require(
                election.status == ElectionStatus.Draft || election.status == ElectionStatus.Paused,
                "BlockBallot: Invalid transition to Active"
            );
        } else if (_newStatus == ElectionStatus.Paused) {
            require(
                election.status == ElectionStatus.Active,
                "BlockBallot: Can only pause an Active election"
            );
        } else if (_newStatus == ElectionStatus.Concluded) {
            require(
                election.status == ElectionStatus.Active || election.status == ElectionStatus.Paused,
                "BlockBallot: Can only conclude Active or Paused election"
            );
        }

        election.status = _newStatus;
        emit ElectionStatusChanged(_electionId, _newStatus);
    }

    /**
     * @notice Registers a nominated candidate in a constituency. Only allowed during Draft status.
     */
    function registerCandidate(
        uint256 _electionId,
        uint256 _constituencyId,
        uint256 _candidateId,
        string calldata _name,
        string calldata _party
    ) external onlyCommissioner {
        ElectionData storage election = elections[_electionId];
        require(election.id != 0, "BlockBallot: Election does not exist");
        require(election.status == ElectionStatus.Draft, "BlockBallot: Candidate registration only allowed in Draft");
        require(_constituencyId != 0, "BlockBallot: Constituency ID cannot be 0");
        require(_candidateId != 0, "BlockBallot: Candidate ID cannot be 0");
        require(bytes(_name).length > 0 && bytes(_party).length > 0, "BlockBallot: Name and party required");
        require(
            candidates[_electionId][_constituencyId][_candidateId].id == 0,
            "BlockBallot: Candidate ID already registered in constituency"
        );

        candidates[_electionId][_constituencyId][_candidateId] = CandidateData({
            id: _candidateId,
            name: _name,
            party: _party,
            constituencyId: _constituencyId,
            voteCount: 0
        });

        _constituencyCandidateIds[_electionId][_constituencyId].push(_candidateId);

        emit CandidateRegistered(_electionId, _constituencyId, _candidateId, _name, _party);
    }

    /**
     * @notice Casts an authorized vote.
     * Enforces:
     * - Election exists and is in Active status
     * - Current block.timestamp is within [startTime, endTime]
     * - Current block.timestamp <= _expiry
     * - _nullifier is non-zero and unspent
     * - Candidate is registered in target constituency
     * - Recovered EIP-712 signer matches authorizationSigner
     * - msg.sender matches voterWallet specified in typed payload
     */
    function castVote(
        uint256 _electionId,
        uint256 _constituencyId,
        uint256 _candidateId,
        bytes32 _nullifier,
        uint256 _expiry,
        bytes calldata _signature
    ) external {
        ElectionData storage election = elections[_electionId];
        require(election.id != 0, "BlockBallot: Election does not exist");
        require(election.status == ElectionStatus.Active, "BlockBallot: Election not active");
        require(
            block.timestamp >= election.startTime && block.timestamp < election.endTime,
            "BlockBallot: Outside voting hours"
        );
        require(block.timestamp <= _expiry, "BlockBallot: Authorization ticket expired");
        require(_nullifier != bytes32(0), "BlockBallot: Nullifier cannot be zero");
        require(!spentNullifiers[_electionId][_nullifier], "BlockBallot: Nullifier already spent");
        require(
            candidates[_electionId][_constituencyId][_candidateId].id != 0,
            "BlockBallot: Candidate not registered in this constituency"
        );

        // Verify EIP-712 Typed Signature bound to msg.sender
        bytes32 structHash = keccak256(
            abi.encode(
                VOTING_AUTHORIZATION_TYPEHASH,
                _electionId,
                _constituencyId,
                msg.sender,
                _nullifier,
                _expiry
            )
        );

        bytes32 hash = _hashTypedDataV4(structHash);
        address recoveredSigner = ECDSA.recover(hash, _signature);
        require(
            recoveredSigner == authorizationSigner,
            "BlockBallot: Invalid or forged EIP-712 voting authorization"
        );

        // Burn nullifier (single-use invariant)
        spentNullifiers[_electionId][_nullifier] = true;

        // Atomically increment tally
        candidates[_electionId][_constituencyId][_candidateId].voteCount += 1;
        election.totalVotes += 1;

        emit VoteCast(_electionId, _constituencyId, _candidateId, _nullifier, msg.sender);
    }

    // View helpers
    function getConstituencyCandidates(uint256 _electionId, uint256 _constituencyId)
        external
        view
        returns (uint256[] memory)
    {
        return _constituencyCandidateIds[_electionId][_constituencyId];
    }

    function getCandidate(uint256 _electionId, uint256 _constituencyId, uint256 _candidateId)
        external
        view
        returns (CandidateData memory)
    {
        return candidates[_electionId][_constituencyId][_candidateId];
    }

    function getElection(uint256 _electionId) external view returns (ElectionData memory) {
        return elections[_electionId];
    }

    function isNullifierSpent(uint256 _electionId, bytes32 _nullifier) external view returns (bool) {
        return spentNullifiers[_electionId][_nullifier];
    }
}
