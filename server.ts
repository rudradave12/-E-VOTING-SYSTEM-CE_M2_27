import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { SERVER_CONFIG, validateServerConfig } from './server/config';
import { voterRouter } from './server/routes/voter';
import { adminRouter } from './server/routes/admin';
import { historicalRouter } from './server/routes/historical';
import { pollRouter } from './server/routes/poll';
import { seedInitialFirestoreData } from './server/firestore';
import { serverStore } from './server/store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // 1. Production Fail-Closed Safeguard
  const configCheck = validateServerConfig();
  if (isProd && !configCheck.isValid) {
    console.error('[BlockBallot Server] FATAL: Production startup aborted due to configuration security violations:');
    for (const err of configCheck.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
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
      if (!isProd) {
        // In local development / test, allow loopback addresses and render domain
        if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.includes('.onrender.com')) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      } else {
        // In production, strictly restrict to configured APP_URL or same-origin
        const appUrl = process.env.APP_URL;
        if (appUrl && origin === appUrl) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      }
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
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
      errors: health.errors,
      warnings: health.warnings,
      timestamp: Date.now(),
    });
  });

  // Mount Voter Verification & OTP routes
  app.use('/api/voter', voterRouter);

  // Mount Historical Results & Political Parties routes
  app.use('/api/historical', historicalRouter);

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

  // Vite development integration or static serving
  const distDir = path.resolve(__dirname, 'dist');
  const distExists = fs.existsSync(path.join(distDir, 'index.html'));

  if (isProd || distExists) {
    app.use(express.static(distDir));
    app.get('*', (_req, res, next) => {
      if (_req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
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
