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
  SYNTHETIC_VOTERS,
} from './data/mockData';
import {
  deriveNullifier,
  setAuthorizationSignerAddress,
} from './utils/crypto';
import { evmSimulator } from './utils/evmSimulator';
import { voterApi } from './services/voterApi';
import { LanguageProvider, useLanguage } from './context/LanguageContext';

// Components
import { AcademicNoticeBanner } from './components/AcademicNoticeBanner';
import { Navbar } from './components/Navbar';
import { PersonaQuickBar } from './components/PersonaQuickBar';
import { VotingStepper } from './components/VotingStepper';

// Screens
import { HomeScreen } from './components/screens/HomeScreen';
import { ElectionsResultsScreen } from './components/screens/ElectionsResultsScreen';
import { CandidatesPartiesScreen } from './components/screens/CandidatesPartiesScreen';
import { ConstituencyInfoScreen } from './components/screens/ConstituencyInfoScreen';
import { HowItWorksScreen } from './components/screens/HowItWorksScreen';
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

export function AppInner() {
  const [currentScreen, setCurrentScreen] = useState<NavigationScreen>('welcome');
  const [isSimulatedEVM, setIsSimulatedEVM] = useState<boolean>(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);

  const [elections, setElections] = useState<Election[]>(INITIAL_ELECTIONS);
  const [activeElectionId, setActiveElectionId] = useState<string>('GE-2024');
  const [constituencies, setConstituencies] = useState<Constituency[]>(INITIAL_CONSTITUENCIES);
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES);
  const [voters, setVoters] = useState<VoterRecord[]>(SYNTHETIC_VOTERS);
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

  const handleSelectPersona = (persona: VoterRecord) => {
    setCurrentVoter(persona);
    setCurrentScreen('identify');
  };

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
        const nullifier = authRes.nullifier || deriveNullifier(currentVoter.epicId, activeElection.numericId);
        const expiry = authRes.expiresAt || Math.floor(Date.now() / 1000) + 900;

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

        setCurrentScreen('constituency');
      } else {
        console.error('Failed to obtain voting authorization ticket from server:', authRes.message);
      }
    } catch (err) {
      console.error('Network error during voter authorization request:', err);
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

  const handleUpdateElectionStatus = async (newStatus: ElectionStatus) => {
    setElections((prev) =>
      prev.map((e) => (e.id === activeElection.id ? { ...e, status: newStatus } : e))
    );
    evmSimulator.setElectionStatus(newStatus);
    setAuditEvents(evmSimulator.getAuditEvents());
    try {
      await voterApi.adminUpdateElectionStatus(activeElection.id, newStatus);
    } catch {
      // Local state is preserved
    }
  };

  const handleCreateElection = async (
    newElection: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>
  ) => {
    const created: Election = {
      ...newElection,
      totalVotesCast: 0,
      totalVotersRegistered: 10000,
    };
    setElections((prev) => [created, ...prev]);
    setActiveElectionId(created.id);
    try {
      await voterApi.adminCreateElection(newElection);
    } catch {
      // Local state is preserved
    }
  };

  const handleAddCandidate = async (newCand: Candidate) => {
    setCandidates((prev) => [...prev, newCand]);
    try {
      await voterApi.adminAddCandidate(newCand);
    } catch {
      // Local state is preserved
    }
  };

  const handleToggleEligibility = async (voterId: string) => {
    const voter = voters.find((v) => v.id === voterId);
    if (!voter) return;
    const nextEligible = !voter.isEligible;
    setVoters((prev) =>
      prev.map((v) => (v.id === voterId ? { ...v, isEligible: nextEligible } : v))
    );
    try {
      await voterApi.adminToggleVoterEligibility(voterId, nextEligible);
    } catch {
      // Local state is preserved
    }
  };

  const handleResetVoterStatus = async (voterId: string) => {
    setVoters((prev) =>
      prev.map((v) => (v.id === voterId ? { ...v, status: 'ELIGIBLE', votedAt: undefined } : v))
    );
    try {
      await voterApi.adminResetVoter(voterId);
    } catch {
      // Local state is preserved
    }
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
      <AcademicNoticeBanner
        isSimulatedEVM={isSimulatedEVM}
        onToggleSimulatedEVM={() => setIsSimulatedEVM((prev) => !prev)}
      />

      <Navbar
        currentScreen={currentScreen}
        onNavigate={(screen) => setCurrentScreen(screen)}
        isAdminAuthenticated={isAdminAuthenticated}
        onAdminLogout={() => {
          setIsAdminAuthenticated(false);
          setCurrentScreen('welcome');
        }}
        voterName={currentVoter?.name}
        onResetVoterSession={handleResetSession}
      />

      {isVoterFlow && (
        <PersonaQuickBar
          activeEpicId={currentVoter?.epicId}
          onSelectPersona={handleSelectPersona}
        />
      )}

      {isVoterFlow && <VotingStepper currentScreen={currentScreen} />}

      <main className="flex-1 pb-16">
        {(currentScreen === 'welcome' || currentScreen === 'home') && (
          <HomeScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            onStartPractice={() => setCurrentScreen('practice-voting')}
          />
        )}

        {currentScreen === 'elections-results' && (
          <ElectionsResultsScreen />
        )}

        {currentScreen === 'candidates-parties' && (
          <CandidatesPartiesScreen />
        )}

        {currentScreen === 'constituencies-info' && (
          <ConstituencyInfoScreen />
        )}

        {currentScreen === 'how-it-works' && (
          <HowItWorksScreen
            onStartPractice={() => setCurrentScreen('practice-voting')}
          />
        )}

        {currentScreen === 'practice-voting' && (
          <PracticeVotingScreen
            currentVoter={currentVoter}
            onSelectPersonaAndStart={(persona) => {
              setCurrentVoter(persona);
              setCurrentScreen('identify');
            }}
            onResetPractice={handleResetSession}
            onResumePractice={() => setCurrentScreen('identify')}
            isVotingInProgress={Boolean(currentVoter)}
          />
        )}

        {currentScreen === 'identify' && (
          <IdentifyScreen
            activeEpicId={currentVoter?.epicId}
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
            onLoginSuccess={() => {
              setIsAdminAuthenticated(true);
              setCurrentScreen('admin-dashboard');
            }}
            onCancel={() => setCurrentScreen('welcome')}
          />
        )}

        {currentScreen === 'admin-dashboard' && (
          <AdminDashboardScreen
            election={activeElection}
            constituencies={constituencies}
            candidates={candidates}
            voters={voters}
            onUpdateElectionStatus={handleUpdateElectionStatus}
            onNavigate={(screen) => setCurrentScreen(screen)}
          />
        )}

        {currentScreen === 'admin-elections' && (
          <AdminElectionsScreen
            elections={elections}
            activeElectionId={activeElectionId}
            onSelectElection={(id) => setActiveElectionId(id)}
            onUpdateStatus={(id, status) => {
              setElections((prev) =>
                prev.map((e) => (e.id === id ? { ...e, status } : e))
              );
              evmSimulator.setElectionStatus(status);
            }}
            onCreateElection={handleCreateElection}
            onBack={() => setCurrentScreen('admin-dashboard')}
          />
        )}

        {currentScreen === 'admin-candidates' && (
          <AdminCandidatesScreen
            constituencies={constituencies}
            candidates={candidates}
            onAddCandidate={handleAddCandidate}
            onBack={() => setCurrentScreen('admin-dashboard')}
          />
        )}

        {currentScreen === 'admin-voters' && (
          <AdminVotersScreen
            voters={voters}
            constituencies={constituencies}
            onToggleEligibility={handleToggleEligibility}
            onResetVoterStatus={handleResetVoterStatus}
            onAddVoter={(voter) => setVoters((prev) => [...prev, voter])}
            onBack={() => setCurrentScreen('admin-dashboard')}
          />
        )}

        {currentScreen === 'admin-audit' && (
          <AdminAuditScreen
            auditEvents={auditEvents}
            contractAddress={activeElection.contractAddress}
            onBack={() => setCurrentScreen(isAdminAuthenticated ? 'admin-dashboard' : 'welcome')}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 px-4 text-xs text-slate-500 text-center">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            BlockBallot · Academic Prototype for Blockchain Electronic Voting Research.
          </p>
          <p className="font-mono text-[11px] text-slate-400">
            Solidity 0.8.20 · EIP-712 · React 19 · Vite
          </p>
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
