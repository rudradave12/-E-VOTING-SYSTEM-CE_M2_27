/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BlockBallot — Phase 10: Historical Election Data Archive Express Router
 * 
 * Read-Only Public Endpoints:
 * - GET /api/archive/elections: Browse/filter/search verified historical elections
 * - GET /api/archive/elections/:id: Full archive record details
 * - GET /api/archive/elections/:id/constituencies: Search constituency results
 * - GET /api/archive/elections/:id/constituencies/:code: Specific constituency result
 * - GET /api/archive/provenance/:id: Source provenance & ECI authority metadata
 * 
 * Administrative Mutation Endpoints:
 * - POST /api/archive/import: Strictly protected import workflow (PLATFORM_ADMIN only)
 * 
 * Invariants Enforced:
 * - Read-only public access with no exposure of voter PII or tokens.
 * - Historical records are strictly separated from live simulation elections.
 * - Conspicuous historical data disclaimer on all responses.
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDataRepositories } from '../repositories';
import { ArchiveImporterService } from '../services/archiveImporter';
import { extractSessionToken, getOfficerSession } from '../auth/rbac';
import { adminSessions } from './admin';
import {
  HistoricalElectionRecord,
  HistoricalVerificationStatus,
  MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
} from '../../../frontend/src/types/archive';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const archiveRouter = Router();

const CANONICAL_2024_PATH = path.resolve(__dirname, '../../../data/historical/eci_2024_general_election.json');

/**
 * Ensures initial verified canonical historical dataset is available in repository.
 */
async function ensureArchiveSeeded(): Promise<void> {
  const repo = getDataRepositories().historicalArchive;
  if (!repo) return;

  const count = await repo.count();
  if (count === 0 && fs.existsSync(CANONICAL_2024_PATH)) {
    try {
      const importer = new ArchiveImporterService(repo);
      await importer.importDataset(CANONICAL_2024_PATH, {
        dryRun: false,
        operatorId: 'SYSTEM_BOOTSTRAP',
      });
    } catch (err: any) {
      console.warn('[ArchiveRouter] Notice during initial historical seed:', err.message);
    }
  }
}

/**
 * Verifies that the requester has PLATFORM_ADMIN authority to modify the historical archive.
 * Rejects public users (401), ordinary electors (403), and operational officers (EO/VRO) (403).
 */
function verifyArchiveAdminAuth(req: Request, res: Response): boolean {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Authentication required. Archive management operations require authorized platform administrator session.',
    });
    return false;
  }

  // Check officer sessions (EO, VRO, PLATFORM_ADMIN)
  const officerSession = getOfficerSession(token);
  if (officerSession) {
    if (officerSession.role !== 'PLATFORM_ADMIN') {
      res.status(403).json({
        success: false,
        message: `Forbidden. Role '${officerSession.role}' does not possess archive management permissions. Only PLATFORM_ADMIN may mutate historical election records.`,
      });
      return false;
    }
    return true;
  }

  // Check legacy admin sessions
  const adminSession = adminSessions.get(token);
  if (adminSession && Date.now() <= adminSession.expiresAt) {
    return true;
  }

  res.status(401).json({
    success: false,
    message: 'Invalid or expired administrative session token.',
  });
  return false;
}

/**
 * GET /api/archive/elections
 * Browse and search historical elections with filtering and pagination.
 */
archiveRouter.get('/elections', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureArchiveSeeded();
    const repo = getDataRepositories().historicalArchive;
    if (!repo) {
      res.status(500).json({ success: false, message: 'Archive repository unavailable.' });
      return;
    }

    const { year, type, state, q, status, page, limit } = req.query;

    const parsedYear = year ? parseInt(String(year), 10) : undefined;
    const parsedPage = Math.max(1, parseInt(String(page) || '1', 10));
    const parsedLimit = Math.max(1, Math.min(50, parseInt(String(limit) || '10', 10)));

    const result = await repo.list({
      year: isNaN(parsedYear as any) ? undefined : parsedYear,
      electionType: type ? String(type) : undefined,
      state: state ? String(state) : undefined,
      query: q ? String(q) : undefined,
      verificationStatus: status ? (String(status) as HistoricalVerificationStatus) : undefined,
      page: parsedPage,
      limit: parsedLimit,
    });

    const totalPages = Math.ceil(result.total / parsedLimit) || 1;

    // Return summaries omitting exhaustive nested candidate arrays for list speed
    const electionSummaries = result.records.map((r) => ({
      id: r.id,
      electionName: r.electionName,
      electionType: r.electionType,
      year: r.year,
      state: r.state,
      geographicScope: r.geographicScope,
      pollDates: r.pollDates,
      countingDate: r.countingDate,
      totalConstituencies: r.totalConstituencies,
      totalElectors: r.totalElectors,
      totalVotesCast: r.totalVotesCast,
      turnoutPercentage: r.turnoutPercentage,
      isVerified: r.isVerified,
      verificationStatus: r.verificationStatus,
      constituenciesCount: r.constituencyResults.length,
      isHistoricalArchive: true,
      provenance: {
        sourceAuthority: r.provenance.sourceAuthority,
        sourceUrl: r.provenance.sourceUrl,
        datasetIdentifier: r.provenance.datasetIdentifier,
        retrievalDate: r.provenance.retrievalDate,
        verificationStatus: r.provenance.verificationStatus,
      },
      importedAt: r.importedAt,
    }));

    res.status(200).json({
      success: true,
      disclaimer: 'Historical data — not live election results',
      nonEndorsementNotice: MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
      total: result.total,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      elections: electionSummaries,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/archive/elections/:id
 * Retrieve a full archived election record by ID with complete constituency breakdown.
 */
archiveRouter.get('/elections/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureArchiveSeeded();
    const repo = getDataRepositories().historicalArchive;
    if (!repo) {
      res.status(500).json({ success: false, message: 'Archive repository unavailable.' });
      return;
    }

    const { id } = req.params;
    const record = await repo.findById(id);

    if (!record) {
      res.status(404).json({
        success: false,
        message: `Historical election record '${id}' not found in archive.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      disclaimer: 'Historical data — not live election results',
      nonEndorsementNotice: MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
      election: record,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/archive/elections/:id/constituencies
 * Search and retrieve constituency-level results for an election.
 */
archiveRouter.get('/elections/:id/constituencies', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureArchiveSeeded();
    const repo = getDataRepositories().historicalArchive;
    if (!repo) {
      res.status(500).json({ success: false, message: 'Archive repository unavailable.' });
      return;
    }

    const { id } = req.params;
    const election = await repo.findById(id);

    if (!election) {
      res.status(404).json({
        success: false,
        message: `Historical election record '${id}' not found in archive.`,
      });
      return;
    }

    const { q, state } = req.query;
    let constituencies = election.constituencyResults;

    if (state && state !== 'ALL') {
      const targetState = String(state).toLowerCase();
      constituencies = constituencies.filter((c) => c.state.toLowerCase() === targetState);
    }

    if (q) {
      const term = String(q).toLowerCase().trim();
      constituencies = constituencies.filter(
        (c) =>
          c.constituencyName.toLowerCase().includes(term) ||
          c.constituencyCode.toLowerCase().includes(term) ||
          (c.winnerName && c.winnerName.toLowerCase().includes(term)) ||
          (c.winnerParty && c.winnerParty.toLowerCase().includes(term)) ||
          c.candidates.some(
            (cand) =>
              cand.candidateName.toLowerCase().includes(term) ||
              cand.partyName.toLowerCase().includes(term) ||
              cand.partyAbbreviation.toLowerCase().includes(term)
          )
      );
    }

    res.status(200).json({
      success: true,
      electionId: election.id,
      electionName: election.electionName,
      year: election.year,
      totalCount: constituencies.length,
      disclaimer: 'Historical data — not live election results',
      constituencies,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/archive/elections/:id/constituencies/:codeOrId
 * Retrieve detailed results for a single parliamentary constituency.
 */
archiveRouter.get('/elections/:id/constituencies/:codeOrId', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureArchiveSeeded();
    const repo = getDataRepositories().historicalArchive;
    if (!repo) {
      res.status(500).json({ success: false, message: 'Archive repository unavailable.' });
      return;
    }

    const { id, codeOrId } = req.params;
    const constituency = await repo.findConstituency(id, codeOrId);

    if (!constituency) {
      res.status(404).json({
        success: false,
        message: `Constituency '${codeOrId}' not found in election '${id}'.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      electionId: id,
      disclaimer: 'Historical data — not live election results',
      constituency,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/archive/provenance/:id
 * Retrieve source provenance, citations, and verification status for an archived election.
 */
archiveRouter.get('/provenance/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await ensureArchiveSeeded();
    const repo = getDataRepositories().historicalArchive;
    if (!repo) {
      res.status(500).json({ success: false, message: 'Archive repository unavailable.' });
      return;
    }

    const { id } = req.params;
    const record = await repo.findById(id);

    if (!record) {
      res.status(404).json({
        success: false,
        message: `Record '${id}' not found.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      electionId: record.id,
      electionName: record.electionName,
      provenance: record.provenance,
      verificationStatus: record.verificationStatus,
      isVerified: record.isVerified,
      verificationNotes: record.verificationNotes,
      importedAt: record.importedAt,
      nonEndorsementNotice: MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/archive/import
 * Administrative batch import workflow for historical datasets.
 * Strictly restricted to PLATFORM_ADMIN.
 */
archiveRouter.post('/import', async (req: Request, res: Response): Promise<void> => {
  if (!verifyArchiveAdminAuth(req, res)) {
    return;
  }

  try {
    const repo = getDataRepositories().historicalArchive;
    if (!repo) {
      res.status(500).json({ success: false, message: 'Archive repository unavailable.' });
      return;
    }

    const { filePath, payload, dryRun, allowUpdates } = req.body;
    const input = payload || filePath;

    if (!input) {
      res.status(400).json({
        success: false,
        message: 'Must provide either payload object or filePath string.',
      });
      return;
    }

    const importer = new ArchiveImporterService(repo);
    const summary = await importer.importDataset(input, {
      dryRun: dryRun ?? false,
      allowUpdates: allowUpdates ?? false,
      operatorId: 'PLATFORM_ADMIN',
    });

    res.status(summary.success ? 200 : 400).json({
      success: summary.success,
      summary,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
