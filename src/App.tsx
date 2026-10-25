/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Election,
  Constituency,
  Candidate,
  VoterRecord,
  NavigationScreen,
  VotingAuthorizationTicket,
  VoteReceipt,
  AuditEvent,
  ElectionStatus,
} from './types';
import {
  INITIAL_ELECTIONS,
  INITIAL_CONSTITUENCIES,
  INITIAL_CANDIDATES,
} from './data/mockData';
import {
  setAuthorizationSignerAddress,
} from './utils/crypto';
import { evmSimulator } from './utils/evmSimulator';
import { voterApi } from './services/voterApi';
import { LanguageProvider, useLanguage } from './context/LanguageContext';

// Components
import { Navbar } from './components/Navbar';
import { VotingStepper } from './components/VotingStepper';

// Screens
import { AvailableElectionsScreen } from './components/screens/AvailableElectionsScreen';
import { HomeScreen } from './components/screens/HomeScreen';
import { ElectionsResultsScreen } from './components/screens/ElectionsResultsScreen';
import { CandidatesPartiesScreen } from './components/screens/CandidatesPartiesScreen';
import { ConstituencyInfoScreen } from './components/screens/ConstituencyInfoScreen';
import { HowItWorksScreen } from './components/screens/HowItWorksScreen';
import { PreferencePollScreen } from './components/screens/PreferencePollScreen';
import { PracticeVotingScreen } from './components/screens/PracticeVotingScreen';
import { WelcomeScreen } from './components/screens/WelcomeScreen';
import { IdentifyScreen } from './components/screens/IdentifyScreen';
import { OtpScreen } from './components/screens/OtpScreen';
import { ConstituencyScreen } from './components/screens/ConstituencyScreen';
import { CandidatesScreen } from './components/screens/CandidatesScreen';
import { ReviewScreen } from './components/screens/ReviewScreen';
import { MetaMaskScreen } from './components/screens/MetaMaskScreen';
import { ReceiptScreen } from './components/screens/ReceiptScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';
import { AdminLoginScreen } from './components/screens/AdminLoginScreen';
import { AdminDashboardScreen } from './components/screens/AdminDashboardScreen';
import { AdminElectionsScreen } from './components/screens/AdminElectionsScreen';
import { AdminCandidatesScreen } from './components/screens/AdminCandidatesScreen';
import { AdminVotersScreen } from './components/screens/AdminVotersScreen';
import { AdminAuditScreen } from './components/screens/AdminAuditScreen';
import { FaceEnrollmentScreen } from './components/screens/FaceEnrollmentScreen';
import { FingerprintEnrollmentScreen } from './components/screens/FingerprintEnrollmentScreen';
import { AdminExceptionsScreen } from './components/screens/AdminExceptionsScreen';
import { HistoricalArchiveScreen } from './components/screens/HistoricalArchiveScreen';
import { ElectionMonitorScreen } from './components/screens/ElectionMonitorScreen';
import { VoterProfile } from './types/dataModel';
import { ShieldAlert, AlertTriangle, Lock, RefreshCw, Key, Maximize2, X, CheckCircle2 } from 'lucide-react';

export function AppInner() {
  const [currentScreen, setCurrentScreen] = useState<NavigationScreen>('welcome');
  const [selectedEnrollmentVoter, setSelectedEnrollmentVoter] = useState<VoterProfile | null>(null);
  const [isSimulatedEVM, setIsSimulatedEVM] = useState<boolean>(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<any>(null);

  // Phase 08: Fullscreen exit tracking & supervised session recovery
  const [fullscreenExitCount, setFullscreenExitCount] = useState<number>(0);
  const [fullscreenWarning, setFullscreenWarning] = useState<{ exitCount: number; message: string } | null>(null);
  const [isSessionLocked, setIsSessionLocked] = useState<boolean>(false);
  const [lockedReason, setLockedReason] = useState<string>('');
  const [showSupervisorModal, setShowSupervisorModal] = useState<boolean>(false);
  const [supervisorEmail, setSupervisorEmail] = useState<string>('eo.sim001@blockballot.local');
  const [supervisorPassword, setSupervisorPassword] = useState<string>('Officer@2024!');
  const [supervisorReason, setSupervisorReason] = useState<string>('Accidental kiosk focus loss; elector verified in person.');
  const [supervisorError, setSupervisorError] = useState<string>('');
  const [supervisorLoading, setSupervisorLoading] = useState<boolean>(false);
  const lastExitHandledAt = React.useRef<number>(0);


  const [elections, setElections] = useState<Election[]>(INITIAL_ELECTIONS);
  const [activeElectionId, setActiveElectionId] = useState<string>('GE-2024');
  const [constituencies, setConstituencies] = useState<Constituency[]>(INITIAL_CONSTITUENCIES);
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES);
  const [voters, setVoters] = useState<VoterRecord[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  const [currentVoter, setCurrentVoter] = useState<VoterRecord | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [authorizationTicket, setAuthorizationTicket] = useState<VotingAuthorizationTicket | null>(null);
  const [voterWalletAddress, setVoterWalletAddress] = useState<string>(
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
  );
  const [activeReceipt, setActiveReceipt] = useState<VoteReceipt | null>(null);

  const activeElection = elections.find((e) => e.id === activeElectionId) || elections[0];
  const activeConstituency =
    constituencies.find((c) => c.id === currentVoter?.constituencyId) || constituencies[0];
  const activeCandidates = candidates.filter(
    (c) => c.constituencyId === (currentVoter?.constituencyId || constituencies[0].id)
  );

  const [activeTestCode, setActiveTestCode] = useState<string>('481920');

  const handleVoterIdentified = (voter: VoterRecord, testCode?: string) => {
    setCurrentVoter(voter);
    if (testCode) setActiveTestCode(testCode);
    setCurrentScreen('otp');
  };

  const handleOtpVerified = async () => {
    if (!currentVoter) return;

    try {
      // Request EIP-712 authorization ticket from the server-side authority
      const authRes = await voterApi.requestAuthorization(
        voterWalletAddress,
        activeElection.numericId,
        31337,
        activeElection.contractAddress
      );

      if (authRes.success && authRes.ticket) {
        const ticket = authRes.ticket;
        const nullifier = ticket.nullifier || authRes.nullifier || '';
        const expiry = ticket.expiry || authRes.expiresAt || Math.floor(Date.now() / 1000) + 900;

        setAuthorizationTicket(ticket);

        setVoters((prev) =>
          prev.map((v) =>
            v.id === currentVoter.id
              ? {
                  ...v,
                  status: 'AUTHORIZED',
                  authorizedWallet: voterWalletAddress,
                  activeNullifier: nullifier,
                  ticketExpiry: expiry,
                }
              : v
          )
        );

        evmSimulator.addAuditEvent({
          type: 'AUTHORIZATION_SIGNED',
          description: `EIP-712 voting authorization ticket signed by Election Authority for constituency #${activeConstituency.code}`,
          electionId: activeElection.numericId,
          constituencyId: Number(activeConstituency.code),
          nullifier,
          isSimulated: isSimulatedEVM,
        });
        setAuditEvents(evmSimulator.getAuditEvents());

        // Phase 08: Request fullscreen upon entering voting workflow
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }

        setCurrentScreen('constituency');
      } else {
        console.error('Failed to obtain voting authorization ticket from server:', authRes.message);
      }
    } catch (err) {
      console.error('Network error during voter authorization request:', err);
    }
  };

  // Phase 08: Listen for fullscreen changes during active voting screens
  React.useEffect(() => {
    const votingScreens: NavigationScreen[] = ['constituency', 'candidates', 'review', 'metamask'];
    const isVotingActive = votingScreens.includes(currentScreen) && Boolean(currentVoter);

    if (!isVotingActive) {
      return;
    }

    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
        const now = Date.now();
        // Debounce within 1.5 seconds to avoid counting transient window events
        if (now - lastExitHandledAt.current < 1500) {
          return;
        }
        lastExitHandledAt.current = now;

        try {
          const res = await voterApi.recordFullscreenExit('UNEXPECTED_FULLSCREEN_EXIT');
          if (res.locked) {
            setIsSessionLocked(true);
            setLockedReason(res.message || 'Voting session locked due to multiple fullscreen exit events.');
            setFullscreenWarning(null);
          } else if (res.success) {
            setFullscreenExitCount(res.exitCount);
            setFullscreenWarning({
              exitCount: res.exitCount,
              message: res.message,
            });
          }
        } catch (err: any) {
          console.warn('[Session Security] Notice recording fullscreen exit:', err.message);
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Authoritative session check on mount / screen change
    voterApi.getSessionStatus().then((statusRes) => {
      if (statusRes.status === 'LOCKED_SUPERVISED_RECOVERY') {
        setIsSessionLocked(true);
        setLockedReason(statusRes.lockedReason || 'Voting session locked due to excessive fullscreen exits.');
      } else if (statusRes.status === 'EXPIRED') {
        alert('Your voting session has expired. Please re-authenticate.');
        handleResetSession();
      }
    }).catch(() => {});

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [currentScreen, currentVoter]);

  const handleSupervisorUnlock = async () => {
    setSupervisorError('');
    if (!supervisorReason || supervisorReason.trim().length < 5) {
      setSupervisorError('Supervised recovery requires an administrative justification reason of at least 5 characters.');
      return;
    }

    setSupervisorLoading(true);
    try {
      let officerToken = voterApi.getAdminToken();
      if (!officerToken) {
        const loginRes = await voterApi.adminLogin({
          email: supervisorEmail.trim(),
          password: supervisorPassword,
        });
        if (!loginRes.success || !loginRes.token) {
          setSupervisorError(loginRes.message || 'Administrative authentication failed. Check credentials.');
          setSupervisorLoading(false);
          return;
        }
        officerToken = loginRes.token;
      }

      const unlockRes = await voterApi.adminUnlockSession({
        reason: supervisorReason.trim(),
      });

      if (unlockRes.success) {
        setIsSessionLocked(false);
        setLockedReason('');
        setFullscreenExitCount(0);
        setFullscreenWarning(null);
        setShowSupervisorModal(false);
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        setSupervisorError(unlockRes.message || 'Failed to unlock voting session.');
      }
    } catch (err: any) {
      setSupervisorError(err.message || 'Network error during session recovery.');
    } finally {
      setSupervisorLoading(false);
    }
  };


  // Load persistent election and candidate data on boot
  React.useEffect(() => {
    async function loadInitialData() {
      try {
        const [loadedElections, loadedConstituencies, loadedCandidates, loadedAudit, serverConfig] = await Promise.all([
          voterApi.getElections(),
          voterApi.getConstituencies(),
          voterApi.getCandidates(),
          voterApi.getAuditEvents(),
          voterApi.getPublicConfig(),
        ]);
        if (loadedElections.length > 0) setElections(loadedElections);
        if (loadedConstituencies.length > 0) setConstituencies(loadedConstituencies);
        if (loadedCandidates.length > 0) setCandidates(loadedCandidates);
        if (loadedAudit.length > 0) setAuditEvents(loadedAudit);
        if (serverConfig.success && serverConfig.authorizationSignerAddress) {
          setAuthorizationSignerAddress(serverConfig.authorizationSignerAddress);
        }
      } catch (err) {
        console.warn('Initial data load notice:', err);
      }
    }
    loadInitialData();
  }, []);

  const handleVoteSuccess = (receipt: VoteReceipt) => {
    setActiveReceipt(receipt);

    if (currentVoter) {
      setVoters((prev) =>
        prev.map((v) =>
          v.id === currentVoter.id
            ? {
                ...v,
                status: 'VOTED',
                votedAt: Date.now(),
              }
            : v
        )
      );

      // Persist verified vote status to server API without candidate selection
      voterApi.recordVote({
        epicId: currentVoter.epicId,
        nullifier: receipt.nullifier,
        electionId: activeElection.numericId,
        constituencyId: activeConstituency.id,
        txHash: receipt.transactionHash,
        isSimulated: isSimulatedEVM,
      }).catch((err) => console.warn('Record vote notice:', err));
    }

    if (selectedCandidate) {
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === selectedCandidate.id
            ? { ...c, voteCount: c.voteCount + 1 }
            : c
        )
      );
    }

    setElections((prev) =>
      prev.map((e) =>
        e.id === activeElection.id
          ? { ...e, totalVotesCast: e.totalVotesCast + 1 }
          : e
      )
    );

    setConstituencies((prev) =>
      prev.map((c) =>
        c.id === activeConstituency.id
          ? { ...c, turnoutCount: c.turnoutCount + 1 }
          : c
      )
    );

    setAuditEvents(evmSimulator.getAuditEvents());
    setCurrentScreen('receipt');
  };

  const handleResetSession = () => {
    setCurrentVoter(null);
    setSelectedCandidate(null);
    setAuthorizationTicket(null);
    setActiveReceipt(null);
    setCurrentScreen('welcome');
  };

  const handleUpdateElectionStatus = async (
    targetOrStatus: string | ElectionStatus,
    maybeStatus?: ElectionStatus,
    reason?: string
  ): Promise<boolean> => {
    let targetId = activeElection.id;
    let targetStatus: ElectionStatus;
    const targetReason: string | undefined = reason;

    if (maybeStatus !== undefined) {
      targetId = targetOrStatus as string;
      targetStatus = maybeStatus;
    } else {
      targetStatus = targetOrStatus as ElectionStatus;
    }

    try {
      const res = await voterApi.adminUpdateElectionStatus(targetId, targetStatus, targetReason);
      if (res.success) {
        setElections((prev) =>
          prev.map((e) =>
            e.id === targetId
              ? {
                  ...e,
                  status: targetStatus,
                  ...(targetReason ? { cancellationReason: targetReason } : {}),
                }
              : e
          )
        );
        if (targetId === activeElection.id) {
          evmSimulator.setElectionStatus(targetStatus);
          setAuditEvents(evmSimulator.getAuditEvents());
        }
        return true;
      } else {
        alert(res.message || 'Failed to update election status on server.');
        return false;
      }
    } catch (err: any) {
      alert(err.message || 'Network error updating election status.');
      return false;
    }
  };

  const handleUpdateElection = async (id: string, updates: Partial<Election>): Promise<boolean> => {
    try {
      const res = await voterApi.adminUpdateElection(id, updates);
      if (res.success && res.election) {
        setElections((prev) => prev.map((e) => (e.id === id ? res.election! : e)));
        return true;
      } else {
        alert(res.message || 'Failed to update election schedule.');
        return false;
      }
    } catch (err: any) {
      alert(err.message || 'Network error updating election.');
      return false;
    }
  };

  const handleCreateElection = async (
    newElection: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>
  ) => {
    try {
      const res = await voterApi.adminCreateElection(newElection);
      if (res.success && res.election) {
        setElections((prev) => [res.election!, ...prev]);
        setActiveElectionId(res.election!.id);
      } else {
        alert(res.message || 'Failed to create election on server.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error creating election.');
    }
  };

  const handleAddCandidate = async (newCand: Candidate) => {
    try {
      const res = await voterApi.adminAddCandidate(newCand);
      if (res.success) {
        setCandidates((prev) => [...prev, newCand]);
      } else {
        alert(res.message || 'Failed to register candidate on server.');
      }
    } catch (err: any) {
      alert(err.message || 'Network error adding candidate.');
    }
  };

  const handleUpdateCandidate = async (candidateId: string, updates: Partial<Candidate>): Promise<boolean> => {
    try {
      const res = await voterApi.adminUpdateCandidate(candidateId, updates);
      if (res.success && res.candidate) {
        setCandidates((prev) => prev.map((c) => (c.id === candidateId ? res.candidate! : c)));
        return true;
      } else {
        alert(res.message || 'Failed to update candidate nomination.');
        return false;
      }
    } catch (err: any) {
      alert(err.message || 'Network error updating candidate.');
      return false;
    }
  };

  const handleDeleteCandidate = async (candidateId: string): Promise<boolean> => {
    try {
      const res = await voterApi.adminDeleteCandidate(candidateId);
      if (res.success) {
        setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
        return true;
      } else {
        alert(res.message || 'Failed to delete candidate nomination.');
        return false;
      }
    } catch (err: any) {
      alert(err.message || 'Network error deleting candidate.');
      return false;
    }
  };

  const handleDeactivateCandidate = async (candidateId: string, reason: string): Promise<boolean> => {
    try {
      const res = await voterApi.adminDeactivateCandidate(candidateId, reason);
      if (res.success && res.candidate) {
        setCandidates((prev) => prev.map((c) => (c.id === candidateId ? res.candidate! : c)));
        return true;
      } else {
        alert(res.message || 'Failed to withdraw candidate nomination.');
        return false;
      }
    } catch (err: any) {
      alert(err.message || 'Network error withdrawing candidate.');
      return false;
    }
  };

  const handleToggleEligibility = async (voterId: string) => {
    const voter = voters.find((v) => v.id === voterId);
    if (!voter) return;
    const nextEligible = !voter.isEligible;
    try {
      const ok = await voterApi.adminToggleVoterEligibility(voterId, nextEligible);
      if (ok) {
        setVoters((prev) =>
          prev.map((v) => (v.id === voterId ? { ...v, isEligible: nextEligible } : v))
        );
      } else {
        alert('Failed to update voter eligibility on server.');
      }
    } catch {
      alert('Network error updating voter eligibility.');
    }
  };

  const handleResetVoterStatus = async (voterId: string) => {
    try {
      const ok = await voterApi.adminResetVoter(voterId);
      if (ok) {
        setVoters((prev) =>
          prev.map((v) => (v.id === voterId ? { ...v, status: 'ELIGIBLE', votedAt: undefined } : v))
        );
      } else {
        alert('Failed to reset voter authorization on server.');
      }
    } catch {
      alert('Network error resetting voter authorization.');
    }
  };

  const handleAdminLoginSuccess = async (user?: any) => {
    setIsAdminAuthenticated(true);
    setAdminUser(user || null);
    setCurrentScreen('admin-dashboard');
    try {
      const [freshElections, freshVoters, freshAudit] = await Promise.all([
        voterApi.getElections(),
        voterApi.adminGetVoters(),
        voterApi.getAuditEvents(),
      ]);
      if (freshElections && freshElections.length > 0) setElections(freshElections);
      if (freshVoters && freshVoters.length > 0) setVoters(freshVoters);
      if (freshAudit && freshAudit.length > 0) setAuditEvents(freshAudit);
    } catch {
      // Local state is preserved if offline
    }
  };

  const handleAdminLogout = async () => {
    await voterApi.adminLogout();
    setIsAdminAuthenticated(false);
    setAdminUser(null);
    setCurrentScreen('welcome');
  };

  const isVoterFlow = [
    'identify',
    'otp',
    'constituency',
    'candidates',
    'review',
    'metamask',
    'receipt',
  ].includes(currentScreen);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 selection:bg-orange-100 selection:text-orange-900">
      <Navbar
        currentScreen={currentScreen}
        onNavigate={(screen) => setCurrentScreen(screen)}
        isAdminAuthenticated={isAdminAuthenticated}
        onAdminLogout={handleAdminLogout}
        voterName={currentVoter?.name}
        onResetVoterSession={handleResetSession}
      />

      {isVoterFlow && <VotingStepper currentScreen={currentScreen} />}

      <main className="flex-1 pb-16">
        {(currentScreen === 'welcome' || currentScreen === 'home') && (
          <HomeScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            elections={elections}
            onStartPractice={() => setCurrentScreen('available-elections')}
          />
        )}

        {(currentScreen === 'available-elections' || currentScreen === 'vote') && (
          <AvailableElectionsScreen
            elections={elections}
            constituencies={constituencies}
            onSelectElectionAndVote={(electionId) => {
              setActiveElectionId(electionId);
              if (currentVoter) {
                setCurrentScreen('constituency');
              } else {
                setCurrentScreen('identify');
              }
            }}
            onViewResults={(electionId) => {
              setActiveElectionId(electionId);
              setCurrentScreen('results');
            }}
          />
        )}

        {(currentScreen === 'elections-results' ||
          currentScreen === 'election-results' ||
          currentScreen === 'results') && (
          <ElectionsResultsScreen
            elections={elections}
            candidates={candidates}
            constituencies={constituencies}
            onNavigateToArchive={() => setCurrentScreen('historical-archive')}
          />
        )}

        {currentScreen === 'candidates-parties' && (
          <CandidatesPartiesScreen />
        )}

        {currentScreen === 'constituencies-info' && (
          <ConstituencyInfoScreen />
        )}

        {currentScreen === 'preference-poll' && (
          <PreferencePollScreen
            currentVoter={currentVoter}
            onNavigateToAuth={() => setCurrentScreen('practice-voting')}
            onNavigateToArchive={() => setCurrentScreen('historical-archive')}
          />
        )}

        {currentScreen === 'historical-archive' && (
          <HistoricalArchiveScreen
            onBackToLive={() => setCurrentScreen('available-elections')}
          />
        )}

        {currentScreen === 'election-monitor' && (
          <ElectionMonitorScreen
            onNavigateToArchive={() => setCurrentScreen('historical-archive')}
            onNavigateToVote={() => setCurrentScreen('available-elections')}
          />
        )}

        {currentScreen === 'how-it-works' && (
          <HowItWorksScreen
            onStartPractice={() => setCurrentScreen('practice-voting')}
          />
        )}

        {currentScreen === 'practice-voting' && (
          <PracticeVotingScreen
            currentVoter={currentVoter}
            onStartIdentification={() => setCurrentScreen('identify')}
            onResetPractice={handleResetSession}
            onResumePractice={() => setCurrentScreen('identify')}
            isVotingInProgress={Boolean(currentVoter)}
          />
        )}

        {currentScreen === 'identify' && (
          <IdentifyScreen
            activeEpicId={currentVoter?.epicId}
            voters={voters}
            onVoterIdentified={handleVoterIdentified}
            onCancel={() => setCurrentScreen('practice-voting')}
          />
        )}

        {currentScreen === 'otp' && currentVoter && (
          <OtpScreen
            voter={currentVoter}
            testDeliveryCode={activeTestCode}
            onOtpVerified={handleOtpVerified}
            onBack={() => setCurrentScreen('identify')}
          />
        )}

        {currentScreen === 'constituency' && currentVoter && (
          <ConstituencyScreen
            voter={currentVoter}
            constituency={activeConstituency}
            voterWalletAddress={voterWalletAddress}
            isSimulatedEVM={isSimulatedEVM}
            onProceed={() => setCurrentScreen('candidates')}
            onBack={() => setCurrentScreen('otp')}
          />
        )}

        {currentScreen === 'candidates' && (
          <CandidatesScreen
            constituency={activeConstituency}
            candidates={activeCandidates}
            selectedCandidateId={selectedCandidate?.id}
            onSelectCandidate={(cand) => setSelectedCandidate(cand)}
            onProceed={() => setCurrentScreen('review')}
            onBack={() => setCurrentScreen('constituency')}
          />
        )}

        {currentScreen === 'review' && currentVoter && selectedCandidate && (
          <ReviewScreen
            voter={currentVoter}
            constituency={activeConstituency}
            candidate={selectedCandidate}
            voterWalletAddress={voterWalletAddress}
            onConfirm={() => setCurrentScreen('metamask')}
            onEdit={() => setCurrentScreen('candidates')}
          />
        )}

        {currentScreen === 'metamask' &&
          currentVoter &&
          selectedCandidate &&
          authorizationTicket && (
            <MetaMaskScreen
              voter={currentVoter}
              constituency={activeConstituency}
              candidate={selectedCandidate}
              ticket={authorizationTicket}
              voterWalletAddress={voterWalletAddress}
              isSimulatedEVM={isSimulatedEVM}
              onVoteSuccess={handleVoteSuccess}
              onCancel={() => setCurrentScreen('review')}
            />
          )}

        {currentScreen === 'receipt' && activeReceipt && (
          <ReceiptScreen
            receipt={activeReceipt}
            onViewResults={() => setCurrentScreen('elections-results')}
            onDone={handleResetSession}
          />
        )}

        {currentScreen === 'results' && (
          <ElectionsResultsScreen />
        )}

        {currentScreen === 'admin-login' && (
          <AdminLoginScreen
            onLoginSuccess={handleAdminLoginSuccess}
            onCancel={() => setCurrentScreen('welcome')}
          />
        )}

        {currentScreen === 'admin-dashboard' && (
          <AdminDashboardScreen
            election={activeElection}
            constituencies={constituencies}
            candidates={candidates}
            voters={voters}
            adminUser={adminUser}
            onUpdateElectionStatus={handleUpdateElectionStatus}
            onNavigate={(screen) => setCurrentScreen(screen)}
            onLogout={handleAdminLogout}
          />
        )}

        {currentScreen === 'admin-elections' && (
          <AdminElectionsScreen
            elections={elections}
            activeElectionId={activeElectionId}
            onSelectElection={(id) => setActiveElectionId(id)}
            onUpdateStatus={handleUpdateElectionStatus}
            onUpdateElection={handleUpdateElection}
            onCreateElection={handleCreateElection}
            onBack={() => setCurrentScreen('admin-dashboard')}
          />
        )}

        {currentScreen === 'admin-candidates' && (
          <AdminCandidatesScreen
            constituencies={constituencies}
            candidates={candidates}
            elections={elections}
            onAddCandidate={handleAddCandidate}
            onUpdateCandidate={handleUpdateCandidate}
            onDeleteCandidate={handleDeleteCandidate}
            onDeactivateCandidate={handleDeactivateCandidate}
            onBack={() => setCurrentScreen('admin-dashboard')}
          />
        )}

        {currentScreen === 'admin-voters' && (
          <AdminVotersScreen
            voters={voters}
            constituencies={constituencies}
            adminUser={adminUser}
            onToggleEligibility={handleToggleEligibility}
            onResetVoterStatus={handleResetVoterStatus}
            onAddVoter={(voter) => setVoters((prev) => [...prev, voter])}
            onBack={() => setCurrentScreen('admin-dashboard')}
            onNavigateToFaceEnrollment={(voter) => {
              setSelectedEnrollmentVoter(voter);
              setCurrentScreen('face-enrollment');
            }}
            onNavigateToFingerprintEnrollment={(voter) => {
              setSelectedEnrollmentVoter(voter);
              setCurrentScreen('fingerprint-enrollment');
            }}
          />
        )}

        {currentScreen === 'face-enrollment' && (
          <FaceEnrollmentScreen
            voter={selectedEnrollmentVoter}
            adminUser={adminUser}
            onBack={() => setCurrentScreen('admin-voters')}
          />
        )}

        {currentScreen === 'fingerprint-enrollment' && (
          <FingerprintEnrollmentScreen
            voter={selectedEnrollmentVoter}
            adminUser={adminUser}
            onBack={() => setCurrentScreen('admin-voters')}
          />
        )}

        {currentScreen === 'admin-audit' && (
          <AdminAuditScreen
            auditEvents={auditEvents}
            contractAddress={activeElection.contractAddress}
            onBack={() => setCurrentScreen(isAdminAuthenticated ? 'admin-dashboard' : 'welcome')}
          />
        )}

        {currentScreen === 'admin-exceptions' && (
          <AdminExceptionsScreen
            adminUser={adminUser}
            onBack={() => setCurrentScreen('admin-dashboard')}
          />
        )}

        {/* Phase 08: Fullscreen Exit Warning Modal (Warning #1 or #2) */}
        {fullscreenWarning && !isSessionLocked && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-amber-200 p-6 space-y-4 text-center">
              <div className="w-14 h-14 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 uppercase tracking-wider">
                  Security Alert · Warning {fullscreenWarning.exitCount} of 2
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Unexpected Exit from Fullscreen
                </h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                {fullscreenWarning.message}
              </p>
              <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-900 text-left border border-amber-200">
                <strong>Electoral Session Protocol:</strong> Voting must take place within the focused fullscreen interface to safeguard voter privacy and session integrity. A third exit will immediately lock this session and require an Election Officer to supervise recovery.
              </div>
              <div className="pt-2">
                <button
                  onClick={() => {
                    if (document.documentElement.requestFullscreen) {
                      document.documentElement.requestFullscreen().catch(() => {});
                    }
                    setFullscreenWarning(null);
                  }}
                  className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Maximize2 className="w-4 h-4" />
                  Resume Voting in Fullscreen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 08: Session Locked & Supervised Recovery Screen / Overlay */}
        {isSessionLocked && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-red-200 p-6 space-y-5 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <ShieldAlert className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 uppercase tracking-wider">
                  Session Locked · Supervised Recovery Required
                </span>
                <h2 className="text-xl font-bold text-slate-900">
                  Voting Session Locked
                </h2>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                {lockedReason || 'This voting terminal has been locked after 3 unexpected fullscreen exit events to prevent unauthorized browser manipulation and protect election integrity.'}
              </p>

              <div className="bg-red-50 rounded-xl p-4 text-xs text-red-900 text-left space-y-2 border border-red-200">
                <div className="font-semibold flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-red-700" />
                  Authoritative Server-Enforced Lockout
                </div>
                <p>
                  In accordance with Phase 08 anti-tamper safeguards, reloading the browser or opening another tab cannot bypass this lock. Only an authorized <strong>Election Officer</strong> (EO) or <strong>Platform Administrator</strong> within this jurisdiction can unlock the session with an audited justification.
                </p>
                {currentVoter && (
                  <div className="pt-1 text-[11px] font-mono text-slate-600">
                    Elector: {currentVoter.name} ({currentVoter.epicId}) · Constituency: {currentVoter.constituencyId}
                  </div>
                )}
              </div>

              {!showSupervisorModal ? (
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => setShowSupervisorModal(true)}
                    className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold shadow-md flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <Key className="w-4 h-4" />
                    Officer Supervised Recovery
                  </button>
                  <button
                    onClick={handleResetSession}
                    className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-colors cursor-pointer text-xs"
                  >
                    Abort & Return Home
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-orange-600" />
                      Officer Credentials & Justification
                    </span>
                    <button
                      onClick={() => setShowSupervisorModal(false)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {supervisorError && (
                    <div className="p-2.5 rounded-lg bg-red-100 text-red-800 text-xs font-medium">
                      {supervisorError}
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                      Supervisor / Officer Email
                    </label>
                    <input
                      type="email"
                      value={supervisorEmail}
                      onChange={(e) => setSupervisorEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                      placeholder="eo.sim001@blockballot.local"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                      Officer Password
                    </label>
                    <input
                      type="password"
                      value={supervisorPassword}
                      onChange={(e) => setSupervisorPassword(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700 uppercase">
                      Audited Justification Reason (min 5 chars)
                    </label>
                    <textarea
                      rows={2}
                      value={supervisorReason}
                      onChange={(e) => setSupervisorReason(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 bg-white"
                      placeholder="e.g. Accidental kiosk focus loss; elector verified in person."
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      disabled={supervisorLoading}
                      onClick={handleSupervisorUnlock}
                      className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {supervisorLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Unlocking...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Authorize Supervised Unlock
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={supervisorLoading}
                      onClick={() => setShowSupervisorModal(false)}
                      className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-8 px-4 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="text-left">
              <span className="font-bold text-slate-800 block text-xs">BlockBallot E-Voting Academic Prototype</span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Synthetic test records only · EIP-712 typed authorizations · Solidity 0.8.20 EVM ledger · Not affiliated with live UIDAI/ECI systems.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
              <span>Local EVM: 31337</span>
              <span>·</span>
              <span>Node.js / Express</span>
              <span>·</span>
              <span>React 19 / Vite</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-4 text-slate-600">
              <button
                onClick={() => setCurrentScreen('how-it-works')}
                className="hover:text-slate-900 hover:underline cursor-pointer"
              >
                How Voting Works
              </button>
              <button
                onClick={() => setCurrentScreen('elections-results')}
                className="hover:text-slate-900 hover:underline cursor-pointer"
              >
                2024 Sourced Results Archive
              </button>
              <button
                onClick={() => setCurrentScreen('candidates-parties')}
                className="hover:text-slate-900 hover:underline cursor-pointer"
              >
                Party & Candidate Reference
              </button>
              <button
                onClick={() => setCurrentScreen('preference-poll')}
                className="hover:text-slate-900 hover:underline cursor-pointer"
              >
                Party Preference Poll (Opinion Survey)
              </button>
            </div>

            <div>
              <button
                onClick={() => setCurrentScreen('admin-login')}
                className="font-semibold text-slate-700 hover:text-orange-700 cursor-pointer"
              >
                Administrative Officer Login →
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
