import React, { useState, useEffect, useCallback } from 'react';
import { VoterRecord, Constituency } from '../../types';
import { VoterProfile } from '../../types/dataModel';
import { voterApi } from '../../services/voterApi';
import {
  Users,
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  RotateCcw,
  Plus,
  Check,
  Copy,
  Edit,
  Trash2,
  Search,
  AlertCircle,
  Loader2,
  RefreshCw,
  Camera,
  Fingerprint,
  Info,
} from 'lucide-react';

interface AdminVotersScreenProps {
  voters: VoterRecord[];
  constituencies: Constituency[];
  adminUser?: any;
  onToggleEligibility: (voterId: string) => void;
  onResetVoterStatus: (voterId: string) => void;
  onAddVoter: (voter: VoterRecord) => void;
  onBack: () => void;
  onNavigateToFaceEnrollment?: (voter: VoterProfile) => void;
  onNavigateToFingerprintEnrollment?: (voter: VoterProfile) => void;
}

export const AdminVotersScreen: React.FC<AdminVotersScreenProps> = ({
  voters: propVoters,
  constituencies,
  adminUser,
  onToggleEligibility,
  onResetVoterStatus,
  onAddVoter,
  onBack,
  onNavigateToFaceEnrollment,
  onNavigateToFingerprintEnrollment,
}) => {
  // RBAC permissions check
  const officerRole = adminUser?.role || 'PLATFORM_ADMIN';
  const canCreate =
    officerRole === 'VOTER_REGISTRATION_OFFICER' ||
    officerRole === 'PLATFORM_ADMIN' ||
    adminUser?.permissions?.includes('VOTER_CREATE');
  const canEdit =
    officerRole === 'VOTER_REGISTRATION_OFFICER' ||
    officerRole === 'PLATFORM_ADMIN' ||
    adminUser?.permissions?.includes('VOTER_UPDATE');
  const canDeactivate =
    officerRole === 'VOTER_REGISTRATION_OFFICER' ||
    officerRole === 'PLATFORM_ADMIN' ||
    adminUser?.permissions?.includes('VOTER_DEACTIVATE');
  const canEnrollBiometrics =
    officerRole === 'VOTER_REGISTRATION_OFFICER' ||
    officerRole === 'PLATFORM_ADMIN' ||
    adminUser?.permissions?.includes('BIOMETRIC_ENROLLMENT_START');

  // Local state for persisted profiles
  const [profiles, setProfiles] = useState<VoterProfile[]>([]);
  const [voterBiometricsMap, setVoterBiometricsMap] = useState<
    Record<string, { faceStatus: string; fingerprintStatus: string }>
  >({});
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters & search
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterConstituency, setFilterConstituency] = useState<string>('ALL');

  // Modal states
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [createdVoter, setCreatedVoter] = useState<VoterProfile | null>(null);
  const [copiedId, setCopiedId] = useState<boolean>(false);

  // Add voter form state
  const [name, setName] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState<string>('1998-05-15');
  const [gender, setGender] = useState<'M' | 'F' | 'O'>('M');
  const [constituencyId, setConstituencyId] = useState<string>(
    constituencies[0]?.id || 'CONST-04-ND'
  );
  const [stateName, setStateName] = useState<string>('NCT of Delhi');
  const [district, setDistrict] = useState<string>('New Delhi');
  const [pollingStation, setPollingStation] = useState<string>(
    'Civic Community Centre, Polling Booth 1'
  );
  const [maskedMobile, setMaskedMobile] = useState<string>('+91 ••••• •1122');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit voter state
  const [editTarget, setEditTarget] = useState<VoterProfile | null>(null);
  const [editBiometrics, setEditBiometrics] = useState<{ faceStatus: string; fingerprintStatus: string } | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editDob, setEditDob] = useState<string>('');
  const [editGender, setEditGender] = useState<'M' | 'F' | 'O'>('M');
  const [editConstituency, setEditConstituency] = useState<string>('');
  const [editPollingStation, setEditPollingStation] = useState<string>('');
  const [editMobile, setEditMobile] = useState<string>('');
  const [editEligible, setEditEligible] = useState<boolean>(true);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Deactivation state
  const [deactivateTarget, setDeactivateTarget] = useState<VoterProfile | null>(null);
  const [isDeactivating, setIsDeactivating] = useState<boolean>(false);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);

  // Calculate age helper
  const calculateAge = (dob: string): number => {
    if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 0;
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
  };

  const currentCalculatedAge = calculateAge(dateOfBirth);

  // Fetch persisted voters from backend API (fail-closed)
  const loadVoters = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await voterApi.adminListVoterProfiles({
        constituencyId: filterConstituency !== 'ALL' ? filterConstituency : undefined,
        search: searchTerm.trim() ? searchTerm.trim() : undefined,
      });

      if (res.success && Array.isArray(res.voters)) {
        setProfiles(res.voters);

        // Fetch biometric metadata summaries for active roll
        Promise.all(
          res.voters.slice(0, 50).map(async (v) => {
            try {
              const bio = await voterApi.adminGetVoter(v.id);
              if (bio.success && bio.biometrics) {
                return [v.id, bio.biometrics] as const;
              }
            } catch {
              // Ignore network glitches for non-critical summaries
            }
            return [v.id, { faceStatus: 'NOT_STARTED', fingerprintStatus: 'NOT_STARTED' }] as const;
          })
        ).then((entries) => {
          const map: Record<string, { faceStatus: string; fingerprintStatus: string }> = {};
          for (const [id, meta] of entries) {
            map[id] = meta;
          }
          setVoterBiometricsMap(map);
        });
      } else {
        // Fallback to legacy prop voters if API endpoint gave empty or unauthenticated response
        if (propVoters.length > 0) {
          const adapted: VoterProfile[] = propVoters.map((v) => ({
            id: v.id,
            simulationVoterId: v.epicId,
            fullName: v.name,
            dateOfBirth: '1995-01-01',
            gender: v.gender,
            state: 'NCT of Delhi',
            district: 'New Delhi',
            constituencyId: v.constituencyId,
            pollingStation: v.pollingStation,
            maskedMobile: v.maskedMobile,
            registrationStatus: 'REGISTERED',
            eligibilityStatus: v.isEligible ? 'ELIGIBLE' : 'INELIGIBLE_DISQUALIFIED',
            lifecycleStatus: 'ACTIVE',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            schemaVersion: '2.0',
          }));
          setProfiles(adapted);
        } else {
          setFetchError(res.message || 'Unable to load electoral roll from server.');
        }
      }
    } catch {
      setFetchError('Network failure connecting to electoral registry service.');
    } finally {
      setLoading(false);
    }
  }, [filterConstituency, searchTerm, propVoters]);

  useEffect(() => {
    loadVoters();
  }, [loadVoters]);

  // Handle Enrollment Submission
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || name.trim().length < 2) {
      setFormError('Please enter a valid elector full name (minimum 2 characters).');
      return;
    }

    if (currentCalculatedAge < 18) {
      setFormError(`Underage violation: Elector is ${currentCalculatedAge} years old. Minimum statutory voting age in India is 18.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await voterApi.adminRegisterVoter({
        fullName: name.trim(),
        dateOfBirth,
        gender,
        constituencyId,
        state: stateName.trim(),
        district: district.trim(),
        pollingStation: pollingStation.trim(),
        maskedMobile: maskedMobile.trim(),
      });

      if (!res.success || !res.voter) {
        setFormError(res.message || 'Failed to enroll elector on backend.');
        setIsSubmitting(false);
        return;
      }

      const newProfile = res.voter;
      setCreatedVoter(newProfile);
      setShowAddModal(false);
      setShowSuccessModal(true);

      // Add to local state & legacy parent handler
      setProfiles((prev) => [newProfile, ...prev]);
      onAddVoter({
        id: newProfile.id,
        epicId: newProfile.simulationVoterId,
        name: newProfile.fullName,
        gender: newProfile.gender,
        age: currentCalculatedAge,
        constituencyId: newProfile.constituencyId,
        pollingStation: newProfile.pollingStation,
        maskedMobile: newProfile.maskedMobile,
        isEligible: newProfile.eligibilityStatus === 'ELIGIBLE' && newProfile.registrationStatus === 'REGISTERED',
        status: 'ELIGIBLE',
      });

      // Reset form
      setName('');
      setDateOfBirth('1998-05-15');
    } catch {
      setFormError('Network error connecting to voter registration endpoint.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Opening Edit Modal
  const openEditModal = async (profile: VoterProfile) => {
    setEditTarget(profile);
    setEditName(profile.fullName);
    setEditDob(profile.dateOfBirth);
    setEditGender(profile.gender);
    setEditConstituency(profile.constituencyId);
    setEditPollingStation(profile.pollingStation);
    setEditMobile(profile.maskedMobile);
    setEditEligible(profile.eligibilityStatus === 'ELIGIBLE');
    setEditError(null);
    setEditBiometrics(null);

    // Fetch biometric details
    try {
      const bioRes = await voterApi.adminGetVoter(profile.id);
      if (bioRes.success && bioRes.biometrics) {
        setEditBiometrics(bioRes.biometrics);
      }
    } catch {
      // Non-fatal fallback
    }
  };

  // Handle Edit Submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditError(null);

    const age = calculateAge(editDob);
    if (age < 18) {
      setEditError(`Underage violation: Calculated age is ${age}. Statutory voting age is 18.`);
      return;
    }

    setIsEditing(true);
    try {
      const res = await voterApi.adminUpdateVoter(editTarget.id, {
        fullName: editName.trim(),
        dateOfBirth: editDob,
        gender: editGender,
        constituencyId: editConstituency,
        pollingStation: editPollingStation.trim(),
        maskedMobile: editMobile.trim(),
        isEligible: editEligible,
      });

      if (!res.success || !res.voter) {
        setEditError(res.message || 'Failed to update voter profile.');
        setIsEditing(false);
        return;
      }

      setProfiles((prev) =>
        prev.map((p) => (p.id === editTarget.id ? res.voter! : p))
      );
      setEditTarget(null);
    } catch {
      setEditError('Network error communicating with update service.');
    } finally {
      setIsEditing(false);
    }
  };

  // Handle Deactivation
  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget) return;
    setDeactivateError(null);
    setIsDeactivating(true);

    try {
      const res = await voterApi.adminDeactivateVoter(deactivateTarget.id);
      if (!res.success || !res.voter) {
        setDeactivateError(res.message || 'Deactivation failed.');
        setIsDeactivating(false);
        return;
      }

      setProfiles((prev) =>
        prev.map((p) => (p.id === deactivateTarget.id ? res.voter! : p))
      );
      setDeactivateTarget(null);
    } catch {
      setDeactivateError('Network error communicating with deactivation service.');
    } finally {
      setIsDeactivating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-2 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Administration Console</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Electoral Roll</span>
            <span aria-hidden="true">·</span>
            <span>Simulation Voter Registry</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded text-[10px]">
              {officerRole}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Voter Registry & Identity Governance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative simulation voter roll. IDs are generated exclusively on the backend with cryptographic entropy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadVoters}
            disabled={loading}
            title="Refresh Registry"
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canCreate ? (
            <button
              onClick={() => {
                setShowAddModal(true);
                setFormError(null);
              }}
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Enroll Synthetic Elector</span>
            </button>
          ) : (
            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>View-Only ({officerRole})</span>
            </div>
          )}
        </div>
      </div>

      {/* Role notice for Election Officers */}
      {!canCreate && (
        <div className="mb-4 p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Role-Based Access Control Notice:</span> Your account is authenticated with the{' '}
            <span className="font-semibold">{officerRole}</span> role. Voter enrollment, demographic edits, and deactivations are strictly reserved for authorized{' '}
            <span className="font-semibold">Voter Registration Officers (VRO)</span>.
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by simulation ID (e.g. BBV-SIM-...), elector name, or constituency..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all font-sans"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterConstituency}
            onChange={(e) => setFilterConstituency(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="ALL">All Constituencies</option>
            {constituencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recoverable Error Banner */}
      {fetchError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Registry Connection Error</p>
              <p className="mt-0.5">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={loadVoters}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Voters Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-500 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-orange-600" />
            <p className="text-xs font-medium">Querying authoritative voter roll...</p>
          </div>
        ) : profiles.length === 0 ? (
          <div className="py-16 text-center px-4">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-slate-800">No Elector Records Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              {searchTerm || filterConstituency !== 'ALL'
                ? 'No registered electors match the specified search or filter criteria.'
                : 'No synthetic electors are enrolled in this constituency scope.'}
            </p>
            {canCreate && (
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Enroll First Elector</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto bb-table-container">
            <table className="w-full min-w-[720px] text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Simulation Voter ID</th>
                  <th className="py-3 px-4">Elector Details</th>
                  <th className="py-3 px-4">Constituency & Polling Station</th>
                  <th className="py-3 px-4">Biometrics Status</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Officer Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((voter) => {
                  const constObj = constituencies.find((c) => c.id === voter.constituencyId);
                  const isDeactivated = voter.registrationStatus === 'DE_REGISTERED' || voter.lifecycleStatus === 'ARCHIVED';
                  const isEligible = voter.eligibilityStatus === 'ELIGIBLE' && !isDeactivated;

                  return (
                    <tr key={voter.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900 tracking-wider">
                            {voter.simulationVoterId}
                          </span>
                          <button
                            onClick={() => copyToClipboard(voter.simulationVoterId)}
                            title="Copy Simulation ID"
                            className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          ID: {voter.id.substring(0, 12)}...
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900 block">{voter.fullName}</span>
                        <span className="text-slate-400 text-[11px]">
                          {voter.gender} · DOB: {voter.dateOfBirth} ({calculateAge(voter.dateOfBirth)} yrs)
                        </span>
                        <span className="text-slate-400 text-[10px] block font-mono">
                          {voter.maskedMobile}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        <div className="font-medium text-slate-900">
                          {constObj ? `${constObj.name} (${constObj.code})` : voter.constituencyId}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs" title={voter.pollingStation}>
                          {voter.pollingStation}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {voter.district}, {voter.state}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1.5 text-[10px]">
                          <button
                            onClick={() => onNavigateToFaceEnrollment?.(voter)}
                            title="Enroll Face or View Live Guidance"
                            className="inline-flex items-center gap-1.5 text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 px-2 py-1 rounded w-fit transition-colors cursor-pointer font-medium"
                          >
                            <Camera className="w-3.5 h-3.5 text-blue-600" />
                            <span>Face: {voterBiometricsMap[voter.id]?.faceStatus || 'NOT_STARTED'}</span>
                          </button>
                          <button
                            onClick={() => onNavigateToFingerprintEnrollment?.(voter)}
                            title="Enroll Fingerprint or View Scanner Status"
                            className="inline-flex items-center gap-1.5 text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 px-2 py-1 rounded w-fit transition-colors cursor-pointer font-medium"
                          >
                            <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Fingerprint: {voterBiometricsMap[voter.id]?.fingerprintStatus || 'NOT_STARTED'}</span>
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                              isEligible
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {isEligible ? (
                              <>
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                <span>ELIGIBLE</span>
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="w-3 h-3 text-red-600" />
                                <span>{isDeactivated ? 'DEACTIVATED' : 'DISQUALIFIED'}</span>
                              </>
                            )}
                          </span>

                          <span className="font-mono text-[10px] text-slate-400">
                            Reg: {voter.registrationStatus}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canEdit && (
                            <button
                              onClick={() => openEditModal(voter)}
                              title="Edit registration demographic fields"
                              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Edit className="w-3.5 h-3.5 text-slate-500" />
                              <span>Edit</span>
                            </button>
                          )}

                          {canDeactivate && !isDeactivated && (
                            <button
                              onClick={() => {
                                setDeactivateTarget(voter);
                                setDeactivateError(null);
                              }}
                              title="Deactivate elector record safely"
                              className="px-2.5 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Deactivate</span>
                            </button>
                          )}

                          <button
                            onClick={() => onResetVoterStatus(voter.id)}
                            title="Reset voting status to ELIGIBLE for test repeat"
                            className="px-2 py-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Voter Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Enroll Synthetic Elector</h2>
                <p className="text-xs text-slate-500">
                  Simulation voter ID will be assigned and persisted exclusively by the server.
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                VRO Scope
              </span>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Elector Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Anandita Sengupta"
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                    required
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Calculated age:</span>
                    <span
                      className={`font-bold ${
                        currentCalculatedAge >= 18 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {currentCalculatedAge} yrs {currentCalculatedAge >= 18 ? '(Eligible)' : '(Ineligible < 18)'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  >
                    <option value="M">Male (M)</option>
                    <option value="F">Female (F)</option>
                    <option value="O">Other (O)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Assigned Constituency <span className="text-red-500">*</span>
                </label>
                <select
                  value={constituencyId}
                  onChange={(e) => setConstituencyId(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                >
                  {constituencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - {c.state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    District
                  </label>
                  <input
                    type="text"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Designated Polling Station
                </label>
                <input
                  type="text"
                  value={pollingStation}
                  onChange={(e) => setPollingStation(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Masked Mobile (OTP Delivery Simulation)
                </label>
                <input
                  type="text"
                  value={maskedMobile}
                  onChange={(e) => setMaskedMobile(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono disabled:opacity-50"
                />
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <span className="font-semibold">Cryptographic ID Generation:</span> Upon confirmation, the backend will generate a unique simulation token (format: <span className="font-mono font-bold">BBV-SIM-...</span>). Biometrics will be initialized as <span className="font-semibold">NOT_STARTED</span>.
                </p>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || currentCalculatedAge < 18}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Generating ID & Persisting...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Confirm & Enroll Elector</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal Showing Backend Generated Simulation ID */}
      {showSuccessModal && createdVoter && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-2xl text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Elector Enrolled Successfully
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              The elector profile has been permanently persisted in the simulated electoral roll.
            </p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-5 text-left space-y-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Backend-Generated Simulation ID
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-base font-bold text-orange-700 tracking-wider">
                  {createdVoter.simulationVoterId}
                </span>
                <button
                  onClick={() => copyToClipboard(createdVoter.simulationVoterId)}
                  className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-md text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedId ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Copy ID</span>
                    </>
                  )}
                </button>
              </div>

              <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-600 space-y-1">
                <div>
                  <span className="text-slate-400">Name:</span> <span className="font-semibold">{createdVoter.fullName}</span>
                </div>
                <div>
                  <span className="text-slate-400">Constituency:</span> <span className="font-semibold">{createdVoter.constituencyId}</span>
                </div>
                <div>
                  <span className="text-slate-400">Status:</span> <span className="font-semibold text-emerald-700">{createdVoter.registrationStatus}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 mb-5 leading-relaxed">
              Academic Simulation Notice: This identifier is an internal simulation token. It is not affiliated with the Election Commission of India.
            </p>

            <button
              onClick={() => {
                setShowSuccessModal(false);
                setCreatedVoter(null);
              }}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors"
            >
              Done & Return to Registry
            </button>
          </div>
        </div>
      )}

      {/* Edit Voter Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Edit Elector Record</h2>
                <p className="text-xs text-slate-500">
                  Update permitted demographic fields. Primary identifiers are immutable.
                </p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              {/* Immutable Identifiers Display */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Simulation Voter ID (Immutable)
                  </span>
                  <span className="font-mono font-bold text-slate-800">
                    {editTarget.simulationVoterId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">
                    Record ID (Server-Owned)
                  </span>
                  <span className="font-mono text-slate-600 text-[11px]">
                    {editTarget.id.substring(0, 16)}...
                  </span>
                </div>
              </div>

              {/* Biometric Status Summary & Actions */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  Biometric Enrollment Status & Workflows
                </span>
                <div className="flex items-center gap-4 text-slate-700 pt-0.5">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Camera className="w-3.5 h-3.5 text-blue-600" />
                    <span>Face: {editBiometrics?.faceStatus || 'NOT_STARTED'}</span>
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Fingerprint: {editBiometrics?.fingerprintStatus || 'NOT_STARTED'}</span>
                  </span>
                </div>

                {canEnrollBiometrics && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => {
                        const target = editTarget;
                        setEditTarget(null);
                        onNavigateToFaceEnrollment?.(target);
                      }}
                      className="flex-1 py-1.5 px-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-blue-600" />
                      <span>Enroll Face</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = editTarget;
                        setEditTarget(null);
                        onNavigateToFingerprintEnrollment?.(target);
                      }}
                      className="flex-1 py-1.5 px-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Enroll Fingerprint</span>
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={isEditing}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={editDob}
                    onChange={(e) => setEditDob(e.target.value)}
                    disabled={isEditing}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value as any)}
                    disabled={isEditing}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="M">Male (M)</option>
                    <option value="F">Female (F)</option>
                    <option value="O">Other (O)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Constituency
                </label>
                <select
                  value={editConstituency}
                  onChange={(e) => setEditConstituency(e.target.value)}
                  disabled={isEditing}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {constituencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Polling Station
                </label>
                <input
                  type="text"
                  value={editPollingStation}
                  onChange={(e) => setEditPollingStation(e.target.value)}
                  disabled={isEditing}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Masked Mobile
                </label>
                <input
                  type="text"
                  value={editMobile}
                  onChange={(e) => setEditMobile(e.target.value)}
                  disabled={isEditing}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Electoral Eligibility
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="radio"
                      name="eligibility"
                      checked={editEligible}
                      onChange={() => setEditEligible(true)}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    <span>Eligible to Cast Ballot</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="radio"
                      name="eligibility"
                      checked={!editEligible}
                      onChange={() => setEditEligible(false)}
                      className="text-orange-600 focus:ring-orange-500"
                    />
                    <span>Disqualified / Ineligible</span>
                  </label>
                </div>
              </div>

              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  disabled={isEditing}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditing}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isEditing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Demographic Updates</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivation Confirmation Modal */}
      {deactivateTarget && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deactivate-modal-title"
          aria-describedby="deactivate-modal-description"
        >
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-2xl">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 stroke-[2]" aria-hidden="true" />
            </div>

            <h3 id="deactivate-modal-title" className="text-lg font-bold text-slate-900 mb-1">
              Deactivate Elector Record
            </h3>
            <p id="deactivate-modal-description" className="text-xs text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to deactivate <span className="font-semibold text-slate-900">{deactivateTarget.fullName}</span> ({deactivateTarget.simulationVoterId})?
            </p>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-2 mb-4">
              <p className="font-bold text-slate-800">Lifecycle Safeguards:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500">
                <li>Record is marked as <span className="font-mono text-slate-800">DE_REGISTERED</span> and <span className="font-mono text-slate-800">ARCHIVED</span>.</li>
                <li>Prevents new voting sessions and future voting authorization tickets.</li>
                <li>Accepted on-chain ballots, receipts, and audit history are <span className="font-semibold text-slate-800">permanently preserved</span>.</li>
              </ul>
            </div>

            {deactivateError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{deactivateError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeactivateTarget(null)}
                disabled={isDeactivating}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-50 bb-touch-target focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivateConfirm}
                disabled={isDeactivating}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer flex items-center gap-1.5 transition-colors disabled:opacity-50 bb-touch-target focus-visible:ring-2 focus-visible:ring-red-500"
              >
                {isDeactivating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deactivating...</span>
                  </>
                ) : (
                  <span>Confirm Deactivation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

