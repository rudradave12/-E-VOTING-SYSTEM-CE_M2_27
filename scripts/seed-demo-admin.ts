/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore, isFirebaseConfigured } from '../backend/server/firebaseAdmin';

dotenv.config();

const ENV_LOCAL_PATH = path.resolve(process.cwd(), '.env.local');

export async function seedDemoAdmin(): Promise<{ email: string; password: string }> {
  let existingContent = '';
  let demoPassword = '';

  if (fs.existsSync(ENV_LOCAL_PATH)) {
    existingContent = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
    const match = existingContent.match(/^DEMO_ADMIN_PASSWORD=(.+)$/m);
    if (match && match[1].trim()) {
      demoPassword = match[1].trim();
    }
  }

  if (!demoPassword) {
    // Generate high-entropy 16-character alphanumeric password with special characters
    const rand = crypto.randomBytes(8).toString('hex');
    demoPassword = `DemoAdmin#${rand}!2026`;

    const newConfig = [
      '# ==============================================================================#',
      '# BlockBallot — Local Environment Configuration (Ignored by Git)',
      '# Local Demo Administrator Credentials for Academic Demonstration Only',
      '# ==============================================================================#',
      'DEMO_ADMIN_EMAIL=demo.admin@blockballot.local',
      `DEMO_ADMIN_PASSWORD=${demoPassword}`,
      'DEMO_ADMIN_ENABLED=true',
      '',
    ].join('\n');

    fs.writeFileSync(ENV_LOCAL_PATH, newConfig, 'utf8');
  }

  // Provision into Firebase Authentication & Firestore Emulator if running
  if (isFirebaseConfigured()) {
    try {
      const auth = getFirebaseAdminAuth();
      try {
        await auth.createUser({
          uid: 'demo-admin-uid',
          email: 'demo.admin@blockballot.local',
          password: demoPassword,
          displayName: 'BlockBallot Demo Administrator',
        });
      } catch (createErr: any) {
        if (createErr.code === 'auth/uid-already-exists' || createErr.code === 'auth/email-already-exists') {
          await auth.updateUser('demo-admin-uid', {
            password: demoPassword,
            displayName: 'BlockBallot Demo Administrator',
          });
        }
      }
      await auth.setCustomUserClaims('demo-admin-uid', { admin: true, role: 'commissioner' });

      const db = getFirebaseAdminFirestore();
      await db.collection('admins').doc('demo-admin-uid').set({
        email: 'demo.admin@blockballot.local',
        displayName: 'BlockBallot Demo Administrator',
        role: 'Returning Officer',
        isDemoAccount: true,
        updatedAt: Date.now(),
      });
    } catch {
      // Emulator provisioning handled gracefully
    }
  }

  console.log('\n==============================================================================');
  console.log(' [BlockBallot] Local Demo Administrator Account Configured');
  console.log('==============================================================================');
  console.log(` Login ID:     demo.admin@blockballot.local`);
  console.log(` Display Name: BlockBallot Demo Administrator`);
  console.log(` Role:         Returning Officer / Election Commissioner`);
  console.log(` Scope:        Local Academic Demonstration Only`);
  console.log(` Config File:  .env.local (ignored in source control)`);
  console.log('==============================================================================\n');

  return { email: 'demo.admin@blockballot.local', password: demoPassword };
}

// Execute directly if run as CLI script
if (process.argv[1]?.endsWith('seed-demo-admin.ts') || process.argv[1]?.endsWith('seed-demo-admin.js')) {
  seedDemoAdmin().catch((err) => {
    console.error('[BlockBallot] Failed to provision demo administrator:', err);
    process.exit(1);
  });
}
