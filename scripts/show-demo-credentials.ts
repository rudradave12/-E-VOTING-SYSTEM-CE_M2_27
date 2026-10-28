/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const ENV_LOCAL_PATH = path.resolve(process.cwd(), '.env.local');

function readEnvLocal(): Record<string, string> {
  const result: Record<string, string> = {};
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    try {
      const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          result[key] = val;
        }
      }
    } catch {
      // Ignored
    }
  }
  return result;
}

export function showDemoCredentials(): void {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production' || process.env.APP_ENV === 'production' || process.env.RENDER === 'true') {
    console.error('SECURITY VIOLATION: Displaying demo credentials is strictly prohibited in production or hosted mode.');
    process.exit(1);
  }

  const envVars = readEnvLocal();

  const eoPassword = envVars['OFFICER_EO_PASSWORD'] || process.env.OFFICER_EO_PASSWORD || 'Officer@2024!';
  const vroPassword = envVars['OFFICER_VRO_PASSWORD'] || process.env.OFFICER_VRO_PASSWORD || 'VroOfficer@2024!';
  const adminPassword = envVars['DEMO_ADMIN_PASSWORD'] || process.env.DEMO_ADMIN_PASSWORD || 'DemoAdminSecret2026!';

  console.log('\n========================================================================');
  console.log('       BLOCKBALLOT LOCAL ACADEMIC DEMONSTRATION CREDENTIALS');
  console.log('    (Fictional Academic Simulation Accounts - Local Dev Only)');
  console.log('========================================================================\n');

  console.log('1. ELECTION OFFICER');
  console.log('   Simulation ID: EO-SIM-001');
  console.log('   Demo Email:    election.officer@blockballot.local');
  console.log('   Role:          ELECTION_OFFICER');
  console.log(`   Credential:    ${eoPassword}`);
  console.log('   Permissions:   Election management & candidate management operations only\n');

  console.log('2. VOTER REGISTRATION OFFICER');
  console.log('   Simulation ID: VRO-SIM-001');
  console.log('   Demo Email:    voter.registration@blockballot.local');
  console.log('   Role:          VOTER_REGISTRATION_OFFICER');
  console.log(`   Credential:    ${vroPassword}`);
  console.log('   Permissions:   Voter enrollment & constituency-scoped registry management only\n');

  console.log('3. PLATFORM ADMINISTRATOR');
  console.log('   Admin UID:     demo-admin-uid');
  console.log('   Demo Email:    demo.admin@blockballot.local');
  console.log('   Role:          PLATFORM_ADMIN');
  console.log(`   Credential:    ${adminPassword}`);
  console.log('   Permissions:   Platform configuration, authority account administration, and audits\n');

  console.log('------------------------------------------------------------------------');
  console.log('Stored securely in: .env.local (ignored by git)');
  console.log('To re-seed credentials: npm run officers:seed && npm run admin:seed');
  console.log('========================================================================\n');
}

if (process.argv[1] && process.argv[1].endsWith('show-demo-credentials.ts')) {
  showDemoCredentials();
}
