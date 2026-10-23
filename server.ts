import express from 'express';
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
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security Headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Health and verification endpoint
  app.get('/api/health', (_req, res) => {
    const configCheck = validateServerConfig();
    res.json({
      status: 'healthy',
      app: 'BlockBallot',
      version: '1.0.0',
      firestoreDatabaseId: SERVER_CONFIG.FIRESTORE_DATABASE_ID,
      projectId: SERVER_CONFIG.PROJECT_ID,
      warnings: configCheck.warnings,
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

  // Asynchronously seed Firestore initial data if uninitialized
  seedInitialFirestoreData().catch((err) => {
    console.warn('[BlockBallot] Initial Firestore seed notice:', err.message);
  });

  // Vite development integration or static serving
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

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
