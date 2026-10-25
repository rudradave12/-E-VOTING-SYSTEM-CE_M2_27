/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { monitorService } from '../services/monitorService';
import { PublicMonitorFilter } from '../../../frontend/src/types';

export const monitorRouter = Router();

// In-memory rate limiting map for public monitor polling
const rateLimitMap: Map<string, { count: number; windowStart: number }> = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120; // 120 reqs/min per IP (ample for 15s-30s polling)

export function clearMonitorRateLimitsForTesting(): void {
  rateLimitMap.clear();
}

/**
 * Rate limit middleware for public monitor endpoints
 */
function monitorRateLimiter(req: Request, res: Response, next: () => void): void {
  // Allow test bypass or localhost bypass during testing
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const current = rateLimitMap.get(clientIp);

  if (!current || now - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { count: 1, windowStart: now });
    return next();
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      success: false,
      message: 'Rate limit exceeded for public election monitor. Please retry in 1 minute.',
      retryAfterSec: Math.ceil((RATE_LIMIT_WINDOW_MS - (now - current.windowStart)) / 1000),
    });
    return;
  }

  current.count += 1;
  next();
}

monitorRouter.use(monitorRateLimiter);

/**
 * GET /api/monitor/overview
 * Returns aggregate metrics across all public elections.
 */
monitorRouter.get('/overview', (_req: Request, res: Response): void => {
  try {
    const overview = monitorService.getOverview();
    res.status(200).json({
      success: true,
      overview,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error generating election monitor overview.',
    });
  }
});

/**
 * GET /api/monitor/elections
 * Queryable, filterable list of public election records.
 */
monitorRouter.get('/elections', (req: Request, res: Response): void => {
  try {
    const filter: PublicMonitorFilter = {
      status: req.query.status as string,
      state: req.query.state as string,
      type: req.query.type as string,
      q: req.query.q as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };

    const result = monitorService.getPublicElections(filter);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error querying public elections.',
    });
  }
});

/**
 * GET /api/monitor/elections/:id
 * Retrieve public election detail with authoritative time calculations.
 */
monitorRouter.get('/elections/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const detail = monitorService.getPublicElectionDetail(id);

    if (!detail) {
      res.status(404).json({
        success: false,
        message: `Election '${id}' not found or is a private draft not available to the public monitor.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      election: detail,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error retrieving public election detail.',
    });
  }
});

/**
 * GET /api/monitor/elections/:id/participation
 * Privacy-safe aggregate voter participation statistics.
 */
monitorRouter.get('/elections/:id/participation', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const metrics = await monitorService.getParticipationMetrics(id);

    if (!metrics) {
      res.status(404).json({
        success: false,
        message: `Election '${id}' not found or is not public.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      metrics,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error calculating participation metrics.',
    });
  }
});

/**
 * GET /api/monitor/elections/:id/results
 * Certified candidate results for concluded/closed elections.
 * GATED: Returns 403 / sealed response while election is open!
 */
monitorRouter.get('/elections/:id/results', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const results = monitorService.getPublishedResults(id);

    if (!results) {
      res.status(404).json({
        success: false,
        message: `Election '${id}' not found or is not public.`,
      });
      return;
    }

    if (!results.resultsAvailable) {
      res.status(200).json({
        success: true,
        ...results,
      });
      return;
    }

    res.status(200).json({
      success: true,
      resultsAvailable: true,
      results,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || 'Error retrieving published election results.',
    });
  }
});
