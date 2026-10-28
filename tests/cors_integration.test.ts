/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { adminRouter } from '../backend/server/routes/admin';

test('BlockBallot — Production CORS & Preflight Safeguards', async (t) => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  const isProd = true; // Test production CORS rules specifically

  t.before(async () => {
    const app = express();
    app.use(express.json());

    // Replicate production CORS middleware from backend/server.ts
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        let isAllowed = false;

        if (!isProd) {
          if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) || origin.endsWith('.onrender.com')) {
            isAllowed = true;
          }
        } else {
          // 1. Configured APP_URL
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

    app.use('/api/admin', adminRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  await t.test('1. Render origin receives Access-Control-Allow-Origin on preflight OPTIONS', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://blockballot-e-voting-system.onrender.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    assert.equal(res.status, 204, 'Must respond with 204 No Content for preflight');
    assert.equal(
      res.headers.get('access-control-allow-origin'),
      'https://blockballot-e-voting-system.onrender.com',
      'Must return Access-Control-Allow-Origin matching the Render domain'
    );
    assert.ok(
      res.headers.get('access-control-allow-methods')?.includes('POST'),
      'Must allow POST method'
    );
  });

  await t.test('2. Render origin receives Access-Control-Allow-Origin on POST /api/admin/login', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Origin': 'https://blockballot-e-voting-system.onrender.com',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'EO-SIM-001', password: 'test' }),
    });

    assert.equal(
      res.headers.get('access-control-allow-origin'),
      'https://blockballot-e-voting-system.onrender.com',
      'Must return Access-Control-Allow-Origin on actual POST requests'
    );
  });

  await t.test('3. Same-origin Host matching returns Access-Control-Allow-Origin in production', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': `http://127.0.0.1:${port}`,
        'Host': `127.0.0.1:${port}`,
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), `http://127.0.0.1:${port}`);
  });

  await t.test('4. Disallowed malicious origin does not receive Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil-phishing-site.example.com',
      },
    });

    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null, 'Must NOT set allow-origin for untrusted domain');
  });
});

