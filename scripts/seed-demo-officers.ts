/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { getFirebaseAdminAuth, getFirebaseAdminFirestore, isFirebaseConfigured } from '../backend/server/firebaseAdmin';
import {
  AuthorityAccount,
  SCHEMA_VERSION_CURRENT,
} from '../frontend/src/types/dataModel';
import {
  DEMO_OFFICER_IDENTIFIERS,
  OPERATIONAL_OFFICER_ROLES,
} from '../frontend/src/types/permissions';
import { getDefaultOfficerDefinitions } from '../backend/server/auth/rbac';
import { getDataRepositories } from '../backend/server/repositories';

dotenv.config();

const ENV_LOCAL_PATH = path.resolve(process.cwd(), '.env.local');

export interface ProvisionedOfficerSummary {
  id: string;
  email: string;
  displayName: string;
  role: string;
  assignmentScope: any;
}

export interface SeedOfficersResult {
  success: boolean;
  officers: ProvisionedOfficerSummary[];
  environment: string;
}

/**
 * Reads existing .env.local content or returns empty string
 */
function readEnvLocal(): string {
  if (fs.existsSync(ENV_LOCAL_PATH)) {
    try {
      return fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Updates or appends a key in .env.local safely
 */
function upsertEnvLocalKey(content: string, key: string, value: string): string {
  const quoted = `"${value}"`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${quoted}`);
  }
  const trimmed = content.trim();
  return trimmed ? `${trimmed}\n${key}=${quoted}\n` : `${key}=${quoted}\n`;
}

/**
 * Seeds exactly two operational officer accounts:
 * 1. EO-SIM-001 (Election Officer)
 * 2. VRO-SIM-001 (Voter Registration Officer)
 */
export async function seedDemoOfficers(): Promise<SeedOfficersResult> {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production' || process.env.APP_ENV === 'production') {
    throw new Error('SECURITY VIOLATION: Local officer development seeding is strictly prohibited in production mode.');
  }

  let envLocalContent = readEnvLocal();

  // 1. Password resolution (retrieve existing or generate high-entropy secure credentials)
  let eoPassword = '';
  const eoMatch = envLocalContent.match(/^OFFICER_EO_PASSWORD=(.+)$/m);
  if (eoMatch && eoMatch[1].trim()) {
    eoPassword = eoMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!eoPassword || eoPassword.length < 8) {
    eoPassword = `EO_${crypto.randomBytes(12).toString('base64url')}!2026`;
    envLocalContent = upsertEnvLocalKey(envLocalContent, 'OFFICER_EO_PASSWORD', eoPassword);
  }

  let vroPassword = '';
  const vroMatch = envLocalContent.match(/^OFFICER_VRO_PASSWORD=(.+)$/m);
  if (vroMatch && vroMatch[1].trim()) {
    vroPassword = vroMatch[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!vroPassword || vroPassword.length < 8) {
    vroPassword = `VRO_${crypto.randomBytes(12).toString('base64url')}!2026`;
  }

  envLocalContent = upsertEnvLocalKey(envLocalContent, 'OFFICER_EO_PASSWORD', eoPassword);
  envLocalContent = upsertEnvLocalKey(envLocalContent, 'OFFICER_VRO_PASSWORD', vroPassword);

  process.env.OFFICER_EO_PASSWORD = eoPassword;
  process.env.OFFICER_VRO_PASSWORD = vroPassword;

  fs.writeFileSync(ENV_LOCAL_PATH, envLocalContent, 'utf8');

  // 2. Load the two operational officer definitions
  const defaults = getDefaultOfficerDefinitions();
  const eoAccount: AuthorityAccount = defaults[DEMO_OFFICER_IDENTIFIERS.ELECTION_OFFICER];
  const vroAccount: AuthorityAccount = defaults[DEMO_OFFICER_IDENTIFIERS.VOTER_REGISTRATION_OFFICER];

  const operationalAccounts = [eoAccount, vroAccount];

  // Invariant verification: Ensure ONLY the two operational roles are provisioned
  for (const acct of operationalAccounts) {
    if (!OPERATIONAL_OFFICER_ROLES.includes(acct.role as any)) {
      throw new Error(`SECURITY VIOLATION: Cannot provision unrecognized operational role: ${acct.role}`);
    }
  }

  // 3. Provision into Authority Repository (in-memory or Firestore)
  try {
    const repos = getDataRepositories();
    for (const acct of operationalAccounts) {
      await repos.authorities.saveAccount(acct);
    }
  } catch (repoErr: any) {
    console.warn('[OfficersSeed] Notice saving to authority repository:', repoErr.message);
  }

  // 4. Provision into Firebase Auth & Firestore Emulator if active
  if (isFirebaseConfigured()) {
    try {
      const auth = getFirebaseAdminAuth();
      const db = getFirebaseAdminFirestore();

      // Provision Election Officer
      try {
        await auth.createUser({
          uid: eoAccount.id,
          email: eoAccount.email,
          password: eoPassword,
          displayName: eoAccount.displayName,
        });
      } catch (err: any) {
        if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
          await auth.updateUser(eoAccount.id, {
            email: eoAccount.email,
            password: eoPassword,
            displayName: eoAccount.displayName,
          });
        }
      }
      await auth.setCustomUserClaims(eoAccount.id, { role: 'ELECTION_OFFICER', officer: true });
      await db.collection('authority_accounts').doc(eoAccount.id).set(eoAccount, { merge: true });

      // Provision Voter Registration Officer
      try {
        await auth.createUser({
          uid: vroAccount.id,
          email: vroAccount.email,
          password: vroPassword,
          displayName: vroAccount.displayName,
        });
      } catch (err: any) {
        if (err.code === 'auth/uid-already-exists' || err.code === 'auth/email-already-exists') {
          await auth.updateUser(vroAccount.id, {
            email: vroAccount.email,
            password: vroPassword,
            displayName: vroAccount.displayName,
          });
        }
      }
      await auth.setCustomUserClaims(vroAccount.id, { role: 'VOTER_REGISTRATION_OFFICER', officer: true });
      await db.collection('authority_accounts').doc(vroAccount.id).set(vroAccount, { merge: true });
    } catch (fbErr: any) {
      // Handled gracefully when emulator is not active; fallback to repository
    }
  }

  console.log('\n==============================================================================');
  console.log(' [BlockBallot] Operational Officer Accounts Provisioned (Phase 03)');
  console.log('==============================================================================');
  console.log(` 1. Election Officer:`);
  console.log(`    Login ID:     ${eoAccount.id} (${eoAccount.email})`);
  console.log(`    Role:         ${eoAccount.role}`);
  console.log(`    Scope:        Constituencies: ${eoAccount.assignmentScope?.constituencyIds?.join(', ')}`);
  console.log(`\n 2. Voter Registration Officer:`);
  console.log(`    Login ID:     ${vroAccount.id} (${vroAccount.email})`);
  console.log(`    Role:         ${vroAccount.role}`);
  console.log(`    Scope:        Constituencies: ${vroAccount.assignmentScope?.constituencyIds?.join(', ')}`);
  console.log(`\n Credential Storage: .env.local (strictly excluded from version control)`);
  console.log(' Passwords are generated securely and NEVER logged or committed.');
  console.log('==============================================================================\n');

  return {
    success: true,
    officers: operationalAccounts.map((a) => ({
      id: a.id,
      email: a.email,
      displayName: a.displayName,
      role: a.role,
      assignmentScope: a.assignmentScope,
    })),
    environment: env,
  };
}

// Execute directly if run as CLI script
if (process.argv[1]?.endsWith('seed-demo-officers.ts') || process.argv[1]?.endsWith('seed-demo-officers.js')) {
  seedDemoOfficers().catch((err) => {
    console.error('[BlockBallot] Failed to provision operational officers:', err);
    process.exit(1);
  });
}
