/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BlockBallot — Phase 10: Historical Election Data Archive Data Model
 * 
 * Strict separation guarantees:
 * - Historical records represent immutable, read-only archival results with official source provenance.
 * - Historical records are NEVER used as operational elections, voting sessions, or ballot targets.
 * - Personally identifiable elector data, biometric records, and private keys are strictly forbidden.
 */

export type HistoricalVerificationStatus =
  | 'VERIFIED_OFFICIAL_GAZETTE'
  | 'PROVISIONAL_OFFICIAL_IMPORT'
  | 'UNVERIFIED';

export type HistoricalElectionType =
  | 'LOK_SABHA'
  | 'VIDHAN_SABHA'
  | 'MUNICIPAL'
  | 'BYE_ELECTION'
  | 'OTHER';

export type HistoricalGeographicScope =
  | 'NATIONAL'
  | 'STATE'
  | 'CONSTITUENCY';

/**
 * Detailed provenance metadata tracking the authoritative origin of historical records.
 */
export interface HistoricalSourceProvenance {
  /** Publishing authority or organization (e.g. 'Election Commission of India (ECI)') */
  sourceAuthority: string;
  /** Primary public URL where the official result or gazette notification was retrieved */
  sourceUrl: string;
  /** Original official publication date if documented by the authority (YYYY-MM-DD) */
  originalPublicationDate?: string;
  /** Date when BlockBallot researchers retrieved or verified this dataset (YYYY-MM-DD) */
  retrievalDate: string;
  /** Unique dataset identifier or gazette citation (e.g. 'ECI-GE-2024-FORM20-V1') */
  datasetIdentifier: string;
  /** Version string of the official dataset release */
  datasetVersion?: string;
  /** Method used to ingest data (e.g. 'OFFICIAL_GAZETTE_EXTRACTION', 'CLI_IMPORT') */
  importMethod: string;
  /** Documented transformations applied during ingest (e.g. ['NORMALIZED_PERCENTAGES']) */
  transformationsApplied?: string[];
  /** Applicable open government or public gazette reuse license */
  licenseNotes?: string;
  /** Cryptographic hash (SHA-256) of the original source payload for tamper-evidence */
  contentHash?: string;
  /** Algorithm used for contentHash */
  checksumAlgorithm?: 'SHA-256';
  /** Verification status of the imported dataset */
  verificationStatus: HistoricalVerificationStatus;
  /** Identity or role of the officer/researcher who validated the records */
  verifiedBy?: string;
  /** Unix timestamp (milliseconds) when verification was certified */
  verifiedAt?: number;
  /** Human-readable notes or caveats from the verification review */
  verificationNotes?: string;
  /** Mandatory academic non-endorsement and non-affiliation notice */
  nonEndorsementDisclaimer: string;
}

/**
 * Published candidate result for an archived constituency.
 * Note: Only values published by the official authority are populated.
 */
export interface HistoricalCandidateResult {
  candidateId: string;
  candidateName: string;
  candidateNameHi?: string;
  partyName: string;
  partyNameHi?: string;
  partyAbbreviation: string;
  symbol?: string;
  symbolKey?: string;
  symbolDescription?: string;
  symbolSource?: string;
  isOfficialSymbolVerified?: boolean;
  /** Published valid votes counted for this candidate */
  votesReceived?: number;
  /** Published vote share percentage (0.0 to 100.0) */
  voteSharePercentage?: number;
  /** True only if declared winner in official gazette */
  isWinner: boolean;
  /** Position rank (1 for winner, 2 for runner-up, etc.) */
  rank?: number;
  education?: string;
  age?: number;
  criminalCases?: number;
  assets?: string;
  affidavitUrl?: string;
}

/**
 * Published constituency election results in the historical archive.
 */
export interface HistoricalConstituencyResult {
  constituencyId: string;
  constituencyCode: string;
  constituencyName: string;
  state: string;
  /** Total registered electors in this constituency at the time of election */
  totalElectors?: number;
  /** Total valid votes counted in this constituency */
  votesCounted?: number;
  /** Official voter turnout percentage */
  turnoutPercentage?: number;
  winnerName?: string;
  winnerParty?: string;
  winningMargin?: number;
  winningMarginPercentage?: number;
  notaVotes?: number;
  notaPercentage?: number;
  isUnopposed?: boolean;
  unopposedNote?: string;
  pollingStationsCount?: number;
  countingDate?: string;
  eciResultPdfUrl?: string;
  candidates: HistoricalCandidateResult[];
}

/**
 * Top-level immutable historical election archive record.
 */
export interface HistoricalElectionRecord {
  /** Unique archive record ID (e.g. 'ARCH-ELEC-2024-LOKSABHA') */
  id: string;
  /** Official title of the historical election */
  electionName: string;
  /** Type of election (e.g. 'LOK_SABHA', 'VIDHAN_SABHA') */
  electionType: HistoricalElectionType;
  /** Calendar year when the election took place */
  year: number;
  /** Formal polling dates (YYYY-MM-DD) */
  pollDates?: string[];
  /** Date of counting and declaration (YYYY-MM-DD) */
  countingDate?: string;
  /** Geographic scope */
  geographicScope: HistoricalGeographicScope;
  /** State name or 'All India' */
  state?: string;
  /** Total constituencies in this election */
  totalConstituencies?: number;
  /** Total registered electors across all covered constituencies */
  totalElectors?: number;
  /** Total valid votes counted */
  totalVotesCast?: number;
  /** Overall official turnout percentage */
  turnoutPercentage?: number;
  /** Unambiguous archival flag ensuring separation from active simulation elections */
  readonly isHistoricalArchive: true;
  /** Overall verification status */
  verificationStatus: HistoricalVerificationStatus;
  /** True if verified against official gazette / authority */
  isVerified: boolean;
  /** Notes on verification or provisional status */
  verificationNotes?: string;
  /** Detailed source provenance metadata */
  provenance: HistoricalSourceProvenance;
  /** Constituency-level published results */
  constituencyResults: HistoricalConstituencyResult[];
  /** Archive schema version for forward-compatibility */
  schemaVersion: string;
  /** Unix timestamp (milliseconds) when imported */
  importedAt: number;
  /** Unix timestamp (milliseconds) when record was last updated */
  updatedAt: number;
}

/**
 * Query filters for browsing the historical election archive.
 */
export interface HistoricalArchiveQuery {
  year?: number;
  electionType?: string;
  state?: string;
  query?: string;
  verificationStatus?: HistoricalVerificationStatus;
  page?: number;
  limit?: number;
}

export interface HistoricalArchiveListResult {
  records: HistoricalElectionRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ArchiveImportSummary {
  success: boolean;
  datasetIdentifier: string;
  dryRun: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  rejected: number;
  conflicts: string[];
  errors: string[];
  importTimestamp: number;
}

export const MANDATORY_NON_ENDORSEMENT_DISCLAIMER =
  'BlockBallot is an academic computer science research prototype demonstrating verifiable e-voting concepts. It is NOT operated, approved, sponsored, or endorsed by the Election Commission of India (ECI) or any governmental entity. All historical records are strictly read-only archival data sourced from public gazettes.';

/**
 * Validates that an imported historical election record conforms strictly to the archive schema.
 */
export function validateHistoricalElectionRecord(record: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Record must be a non-null object.'] };
  }

  if (!record.id || typeof record.id !== 'string' || record.id.trim().length === 0) {
    errors.push('id must be a non-empty string.');
  }

  if (!record.electionName || typeof record.electionName !== 'string') {
    errors.push('electionName must be a non-empty string.');
  }

  const validTypes: HistoricalElectionType[] = ['LOK_SABHA', 'VIDHAN_SABHA', 'MUNICIPAL', 'BYE_ELECTION', 'OTHER'];
  if (!validTypes.includes(record.electionType)) {
    errors.push(`electionType must be one of: ${validTypes.join(', ')}.`);
  }

  if (typeof record.year !== 'number' || record.year < 1947 || record.year > 2100) {
    errors.push('year must be a valid calendar year between 1947 and 2100.');
  }

  // Provenance validation
  if (!record.provenance || typeof record.provenance !== 'object') {
    errors.push('provenance metadata is required.');
  } else {
    if (!record.provenance.sourceAuthority || typeof record.provenance.sourceAuthority !== 'string') {
      errors.push('provenance.sourceAuthority must be a non-empty string.');
    }
    if (!record.provenance.sourceUrl || typeof record.provenance.sourceUrl !== 'string') {
      errors.push('provenance.sourceUrl must be a valid URL string.');
    }
    if (!record.provenance.retrievalDate || typeof record.provenance.retrievalDate !== 'string') {
      errors.push('provenance.retrievalDate is required.');
    }
    if (!record.provenance.datasetIdentifier || typeof record.provenance.datasetIdentifier !== 'string') {
      errors.push('provenance.datasetIdentifier is required.');
    }
  }

  // Constituency results validation
  if (!Array.isArray(record.constituencyResults)) {
    errors.push('constituencyResults must be an array.');
  } else {
    record.constituencyResults.forEach((constituency: any, cIdx: number) => {
      if (!constituency.constituencyId || typeof constituency.constituencyId !== 'string') {
        errors.push(`constituencyResults[${cIdx}].constituencyId must be a string.`);
      }
      if (!constituency.constituencyName || typeof constituency.constituencyName !== 'string') {
        errors.push(`constituencyResults[${cIdx}].constituencyName must be a string.`);
      }
      if (!Array.isArray(constituency.candidates)) {
        errors.push(`constituencyResults[${cIdx}].candidates must be an array.`);
      } else {
        constituency.candidates.forEach((cand: any, candIdx: number) => {
          if (!cand.candidateName || typeof cand.candidateName !== 'string') {
            errors.push(`constituencyResults[${cIdx}].candidates[${candIdx}].candidateName is required.`);
          }
          if (typeof cand.isWinner !== 'boolean') {
            errors.push(`constituencyResults[${cIdx}].candidates[${candIdx}].isWinner must be a boolean.`);
          }
        });
      }
    });
  }

  // Check for any accidental personally identifiable information
  if (checkForPII(record)) {
    errors.push('CRITICAL: Record contains forbidden personally identifiable elector information, biometric data, or authentication secrets.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detects prohibited PII, biometrics, tokens, or live voting session fields in archive payloads.
 */
export function checkForPII(data: any): boolean {
  if (!data || typeof data !== 'object') return false;

  const forbiddenTerms = [
    'aadhaar',
    'biometric',
    'fingerprint',
    'faceembedding',
    'facemodel',
    'sessiontoken',
    'authtoken',
    'privatekey',
    'mnemonic',
    'secretkey',
    'nullifier',
    'dob',
    'dateofbirth',
    'mobilenumber',
    'phonenumber',
    'voterchoice',
  ];

  function inspectObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) {
      return obj.some((item) => inspectObject(item));
    }
    for (const rawKey of Object.keys(obj)) {
      const normalizedKey = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const term of forbiddenTerms) {
        if (normalizedKey.includes(term)) {
          return true;
        }
      }
      const val = obj[rawKey];
      if (typeof val === 'object' && val !== null) {
        if (inspectObject(val)) return true;
      }
    }
    return false;
  }

  return inspectObject(data);
}
