import { Router, Request, Response } from 'express';
import {
  getAllHistoricalConstituenciesFromFirestore,
  getHistoricalConstituencyByIdFromFirestore,
  getAllPoliticalPartiesFromFirestore,
  importOfficialHistorical2024Data,
} from '../firestore';
import { HISTORICAL_PROVENANCE, BATCH_IMPORT_SPECIFICATION } from '../../../frontend/src/data/historical2024';
import { verifyAdminAuth } from './admin';

export const historicalRouter = Router();

/**
 * GET /api/historical/provenance
 * Provenance metadata, ECI legal authority citations, non-endorsement disclaimer
 */
historicalRouter.get('/provenance', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    provenance: HISTORICAL_PROVENANCE,
    batchImportSpecification: BATCH_IMPORT_SPECIFICATION,
  });
});

/**
 * GET /api/historical/constituencies
 * Official 2024 Lok Sabha Parliamentary Constituencies
 */
historicalRouter.get('/constituencies', async (_req: Request, res: Response): Promise<void> => {
  try {
    const constituencies = await getAllHistoricalConstituenciesFromFirestore();
    res.status(200).json({
      success: true,
      electionYear: 2024,
      totalCount: constituencies.length,
      provenance: 'Election Commission of India (ECI) Form 20 & Statistical Reports 2024',
      isOfficialArchive: true,
      constituencies,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/historical/constituencies/:id
 * Detailed candidate results and turnout for a single constituency
 */
historicalRouter.get('/constituencies/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const constituency = await getHistoricalConstituencyByIdFromFirestore(id);
    if (!constituency) {
      res.status(404).json({ success: false, message: `Constituency ${id} not found in historical archive.` });
      return;
    }
    res.status(200).json({
      success: true,
      isOfficialArchive: true,
      constituency,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/historical/parties
 * 10 Verified Political Parties (6 National + 4 State) with official symbols and ECI classifications
 */
historicalRouter.get('/parties', async (_req: Request, res: Response): Promise<void> => {
  try {
    const parties = await getAllPoliticalPartiesFromFirestore();
    res.status(200).json({
      success: true,
      totalParties: parties.length,
      nationalPartiesCount: parties.filter((p) => p.type === 'NATIONAL').length,
      statePartiesCount: parties.filter((p) => p.type === 'STATE').length,
      citation: 'ECI Notification No. 56/2024/PPS-III dated 23 March 2024',
      parties,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/historical/import
 * Idempotent batch import pipeline for official records
 * Strictly requires verified administrator authentication
 */
historicalRouter.post('/import', async (req: Request, res: Response): Promise<void> => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer administrative authentication required.' });
    return;
  }

  try {
    const result = await importOfficialHistorical2024Data(true);
    res.status(200).json({
      success: result.success,
      message: result.message,
      constituenciesImported: result.constituenciesImported,
      partiesImported: result.partiesImported,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
