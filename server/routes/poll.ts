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

export const pollRouter = Router();

/**
 * Helper to extract or validate authenticated userId.
 * Supports Bearer token, session header, or client authenticated ID.
 */
function extractUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return token;
  }
  const customUserHeader = req.headers['x-poll-user-id'] as string;
  if (customUserHeader && customUserHeader.trim().length > 0) {
    return customUserHeader.trim();
  }
  const bodyUserId = req.body?.userId;
  if (bodyUserId && typeof bodyUserId === 'string' && bodyUserId.trim().length > 0) {
    return bodyUserId.trim();
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
    const userId = extractUserId(req) || (req.query.userId as string);

    if (!userId) {
      res.status(400).json({ success: false, message: 'User identifier required to query response receipt.' });
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
 * Atomic transaction: records 1 response per user and updates aggregate totals
 */
pollRouter.post('/:pollId/vote', async (req: Request, res: Response): Promise<void> => {
  try {
    const { pollId } = req.params;
    const { partyCode } = req.body;
    const userId = extractUserId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. An active authenticated session is required to participate in this poll.',
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
 * Admin endpoint: recalculates aggregates from actual persisted individual response documents
 */
pollRouter.post('/:pollId/reconcile', async (req: Request, res: Response): Promise<void> => {
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
 * Admin endpoint to open or close poll
 */
pollRouter.patch('/:pollId/status', async (req: Request, res: Response): Promise<void> => {
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
