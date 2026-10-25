import { Router, Request, Response } from 'express';
import {
  DEFAULT_PREFERENCE_POLL_ID,
  getPreferencePollFromFirestore,
  getPollAggregateFromFirestore,
  getUserPollResponseFromFirestore,
  submitPollResponseToFirestore,
  reconcilePollAggregatesInFirestore,
  updatePreferencePollStatus,
  getAllPoliticalPartiesFromFirestore,
} from '../firestore';
import { verifyAdminAuth } from './admin';
import { serverStore } from '../store';
import { getFirebaseAdminAuth } from '../firebaseAdmin';

export const pollRouter = Router();

/**
 * Derives voter identity strictly from a verified authentication token or valid server session.
 * Rejects untrusted client-supplied identity parameters (request body or headers).
 */
async function resolveAuthenticatedVoterId(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  if (!token) return null;

  // 1. Check server voter session
  const voterSession = serverStore.getSession(token);
  if (voterSession) {
    return voterSession.voterId || voterSession.epicId;
  }

  // 2. Check Firebase ID token
  try {
    const auth = getFirebaseAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    if (decoded?.uid) {
      return decoded.uid;
    }
  } catch {
    // Unverified or invalid Firebase ID token
  }

  return null;
}

/**
 * GET /api/poll
 * Retrieves the primary independent party-preference poll configuration and current aggregates
 */
pollRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [poll, aggregate, parties] = await Promise.all([
      getPreferencePollFromFirestore(DEFAULT_PREFERENCE_POLL_ID),
      getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID),
      getAllPoliticalPartiesFromFirestore(),
    ]);

    if (!poll) {
      res.status(404).json({ success: false, message: 'Preference poll configuration not found.' });
      return;
    }

    res.status(200).json({
      success: true,
      poll,
      aggregate,
      parties,
      disclaimer: 'Unofficial, non-binding party preference poll. Not run, operated, or approved by the Election Commission of India.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/poll/:pollId
 */
pollRouter.get('/:pollId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pollId } = req.params;
    const [poll, aggregate, parties] = await Promise.all([
      getPreferencePollFromFirestore(pollId),
      getPollAggregateFromFirestore(pollId),
      getAllPoliticalPartiesFromFirestore(),
    ]);

    if (!poll) {
      res.status(404).json({ success: false, message: `Poll ${pollId} not found.` });
      return;
    }

    res.status(200).json({
      success: true,
      poll,
      aggregate,
      parties,
      disclaimer: 'Unofficial, non-binding party preference poll.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/poll/:pollId/my-response
 * Checks if the current authenticated user has already submitted a response
 */
pollRouter.get('/:pollId/my-response', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pollId } = req.params;
    const userId = await resolveAuthenticatedVoterId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. A verified voter session is required to query poll receipts.',
      });
      return;
    }

    const response = await getUserPollResponseFromFirestore(pollId, userId);
    res.status(200).json({
      success: true,
      hasVoted: !!response,
      response: response || null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/poll/:pollId/vote
 * Atomic transaction: records 1 response per user and updates aggregate totals.
 * Identity is derived strictly from verified authentication token or server session.
 */
pollRouter.post('/:pollId/vote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pollId } = req.params;
    const { partyCode } = req.body;
    const userId = await resolveAuthenticatedVoterId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. A verified voter session or authentication token is required to participate in this poll.',
      });
      return;
    }

    if (!partyCode || typeof partyCode !== 'string' || partyCode.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'A valid party option must be selected.',
      });
      return;
    }

    const result = await submitPollResponseToFirestore(pollId, userId, partyCode);

    if (!result.success) {
      const statusCode = result.message.includes('already submitted') ? 409 : 400;
      res.status(statusCode).json({
        success: false,
        message: result.message,
      });
      return;
    }

    // Retrieve updated aggregate snapshot
    const updatedAggregate = await getPollAggregateFromFirestore(pollId);

    res.status(201).json({
      success: true,
      message: result.message,
      receipt: result.receipt,
      aggregate: updatedAggregate,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/poll/:pollId/reconcile
 * Admin endpoint: recalculates aggregates from actual persisted individual response documents.
 * Strictly requires verified administrator authentication.
 */
pollRouter.post('/:pollId/reconcile', async (req: Request, res: Response): Promise<void> => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer administrative authentication required.' });
    return;
  }

  try {
    const { pollId } = req.params;
    const result = await reconcilePollAggregatesInFirestore(pollId);
    res.status(200).json({
      success: true,
      message: 'Poll response aggregates reconciled with 100% agreement against persisted response documents.',
      totalResponses: result.totalResponses,
      partyTallies: result.partyTallies,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PATCH /api/poll/:pollId/status
 * Admin endpoint to open or close poll.
 * Strictly requires verified administrator authentication.
 */
pollRouter.patch('/:pollId/status', async (req: Request, res: Response): Promise<void> => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer administrative authentication required.' });
    return;
  }

  try {
    const { pollId } = req.params;
    const { status } = req.body;

    if (status !== 'open' && status !== 'closed') {
      res.status(400).json({ success: false, message: 'Status must be either "open" or "closed".' });
      return;
    }

    await updatePreferencePollStatus(pollId, status);
    res.status(200).json({
      success: true,
      message: `Poll status updated to ${status}.`,
      status,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});
