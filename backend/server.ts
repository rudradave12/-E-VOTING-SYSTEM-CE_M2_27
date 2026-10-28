import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { SERVER_CONFIG, validateServerConfig } from './server/config';
import { voterRouter } from './server/routes/voter';
import { adminRouter } from './server/routes/admin';
import { historicalRouter } from './server/routes/historical';
import { archiveRouter } from './server/routes/archive';
import { monitorRouter } from './server/routes/monitor';
import { pollRouter } from './server/routes/poll';
import { seedInitialFirestoreData } from './server/firestore';
import { serverStore } from './server/store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

  // 1. Production Fail-Closed Safeguard
  const configCheck = validateServerConfig();
  if (isProd && !configCheck.isValid) {
    if (process.env.HOSTED_DEMO_ENABLED === 'true') {
      console.warn('[BlockBallot Server] NOTICE: Running in HOSTED_DEMO_ENABLED mode with academic fallback keys for demonstration.');
      for (const err of configCheck.errors) {
        console.warn(`  [Demo Advisory] ${err}`);
      }
    } else {
      console.error('[BlockBallot Server] FATAL: Production startup aborted due to configuration security violations:');
      for (const err of configCheck.errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  }

  const app = express();

  // Hide technology disclosure
  app.disable('x-powered-by');

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Strict CORS Boundary
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      let isAllowed = false;

      if (!isProd) {
        // In local development / test, allow loopback addresses and render domain
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.endsWith('.onrender.com')) {
          isAllowed = true;
        }
      } else {
        // In production:
        // 1. Explicitly configured APP_URL
        const appUrl = process.env.APP_URL;
        if (appUrl && (origin === appUrl || origin.replace(/\/$/, '') === appUrl.replace(/\/$/, ''))) {
          isAllowed = true;
        }
        // 2. Render-injected external deployment URL
        const renderUrl = process.env.RENDER_EXTERNAL_URL;
        if (renderUrl && (origin === renderUrl || origin.replace(/\/$/, '') === renderUrl.replace(/\/$/, ''))) {
          isAllowed = true;
        }
        // 3. Render hosted service domain
        if (origin.endsWith('.onrender.com')) {
          isAllowed = true;
        }
        // 4. Same-origin match with incoming Host header
        const originHost = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '').toLowerCase();
        const hostHeader = (req.get('host') || '').replace(/:\d+$/, '').toLowerCase();
        if (originHost && hostHeader && originHost === hostHeader) {
          isAllowed = true;
        }
      }

      if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Comprehensive Security Headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https:; connect-src 'self' http://127.0.0.1:* http://localhost:* https://*.googleapis.com;"
    );
    next();
  });

  // Health and verification endpoint
  app.get('/api/health', (_req, res) => {
    const health = validateServerConfig();
    const statusOk = health.isValid;
    res.status(statusOk ? 200 : (isProd ? 503 : 200)).json({
      status: statusOk ? 'healthy' : 'degraded',
      app: 'BlockBallot',
      version: '1.0.0',
      isProduction: isProd,
      signerAddress: health.signerAddress,
      contractSignerMatch: health.contractSignerMatch,
      firestoreDatabaseId: SERVER_CONFIG.FIRESTORE_DATABASE_ID,
      projectId: SERVER_CONFIG.PROJECT_ID,
      hostedDemoEnabled: process.env.HOSTED_DEMO_ENABLED === 'true',
      academicDisclaimer:
        'BlockBallot — Academic Voting Simulation. Non-binding demonstration only. Not affiliated with or endorsed by the Election Commission of India or UIDAI.',
      errors: health.errors,
      warnings: health.warnings,
      timestamp: Date.now(),
    });
  });

  // Mount Voter Verification & OTP routes
  app.use('/api/voter', voterRouter);

  // Mount Historical Results & Political Parties routes
  app.use('/api/historical', historicalRouter);

  // Mount Phase 10 Historical Election Data Archive routes
  app.use('/api/archive', archiveRouter);

  // Mount Phase 11 Public Election Monitor routes
  app.use('/api/monitor', monitorRouter);

  // Mount Independent Party-Preference Poll routes
  app.use('/api/poll', pollRouter);

  // Mount Admin, Election Management, Results and Audit routes
  app.use('/api/admin', adminRouter);
  app.use('/api', adminRouter);

  // Asynchronously seed Firestore initial data and sync in-memory store from persistence
  seedInitialFirestoreData()
    .then(() => serverStore.syncFromFirestore())
    .catch((err) => {
      console.warn('[BlockBallot] Initial Firestore seed/sync notice:', err.message);
    });

  // Robust production dist resolution across project layouts
  const distCandidates = [
    path.resolve(__dirname, '../dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, '../../dist'),
    path.resolve(__dirname, '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
  ];
  let distDir = distCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

  // Self-healing fallback: if in production/Render or hosted mode and dist does not exist, run build
  const isHosted = isProd || process.env.RENDER === 'true' || process.env.HOSTED_DEMO_ENABLED === 'true';
  if (!distDir && isHosted) {
    console.warn('[BlockBallot Server] Production build not found at startup. Executing self-healing frontend build...');
    try {
      const { execSync } = await import('child_process');
      execSync('npm run build', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
      distDir = distCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
    } catch (buildErr: any) {
      console.error('[BlockBallot Server] Self-healing build notice:', buildErr?.message);
    }
  }

  if (distDir && fs.existsSync(path.join(distDir, 'index.html'))) {
    console.log(`[BlockBallot Server] Serving static production bundle from: ${distDir}`);
    // Static assets with fingerprinted caching (1 year immutable)
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      })
    );
    // General static assets with no-cache on index.html
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    // SPA catch-all for client-side routing (excluding /api/*)
    app.get('*', (_req, res, next) => {
      if (_req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir!, 'index.html'));
    });
  } else {
    console.warn('[BlockBallot Server] NOTICE: Vite dev server middleware active (local development only).');
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, '../frontend/vite.config.ts'),
      root: path.resolve(__dirname, '../frontend'),
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Centralized safe error handler: sanitizes errors in production to prevent stack trace disclosure
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[BlockBallot Server] Unhandled internal error:', err?.message || err);
    res.status(err.status || 500).json({
      success: false,
      message: isProd ? 'Internal server error occurred.' : (err?.message || 'Internal server error'),
      ...(isProd ? {} : { stack: err?.stack }),
    });
  });

  const port = SERVER_CONFIG.PORT;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[BlockBallot Server] Running on http://0.0.0.0:${port}`);
    console.log(`[BlockBallot Server] Target Firestore: ${SERVER_CONFIG.FIRESTORE_DATABASE_ID} in ${SERVER_CONFIG.PROJECT_ID}`);
  });
}

startServer().catch((err) => {
  console.error('[BlockBallot Server] Fatal startup error:', err);
  process.exit(1);
});
