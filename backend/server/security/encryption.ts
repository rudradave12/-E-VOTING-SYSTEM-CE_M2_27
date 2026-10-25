/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { IKeyProvider, getKeyProvider } from './keyProvider';

export class DecryptionError extends Error {
  constructor(message = 'Decryption failed: authentication tag mismatch or corrupted ciphertext.') {
    super(message);
    this.name = 'DecryptionError';
  }
}

export class KeyNotFoundError extends DecryptionError {
  constructor(keyId: string) {
    super(`Decryption failed: encryption key '${keyId}' not found in key provider registry.`);
    this.name = 'KeyNotFoundError';
  }
}

export interface EncryptedEnvelope {
  keyId: string;
  version: number;
  algorithm: 'AES-256-GCM';
  iv: string; // 12-byte nonce (24 hex characters)
  tag: string; // 16-byte authentication tag (32 hex characters)
  ciphertext: string; // hex-encoded ciphertext
  aad?: string; // Optional authenticated additional data
}

export const ENVELOPE_PREFIX = 'enc:v1:';

/**
 * Checks whether a given string is a formatted BlockBallot encrypted envelope.
 */
export function isEncryptedString(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  return val.startsWith(ENVELOPE_PREFIX);
}

/**
 * Serializes an EncryptedEnvelope to a compact database string.
 * Format: enc:v1:<keyId>:<iv>:<tag>:<ciphertext>
 */
export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return `${ENVELOPE_PREFIX}${envelope.keyId}:${envelope.iv}:${envelope.tag}:${envelope.ciphertext}`;
}

/**
 * Parses a serialized envelope string back into an EncryptedEnvelope structure.
 */
export function parseEnvelope(serialized: string): EncryptedEnvelope | null {
  if (!isEncryptedString(serialized)) {
    return null;
  }

  const raw = serialized.slice(ENVELOPE_PREFIX.length);
  const parts = raw.split(':');
  if (parts.length !== 4) {
    return null;
  }

  const [keyId, iv, tag, ciphertext] = parts;
  if (!keyId || !iv || !tag || ciphertext === undefined) {
    return null;
  }

  return {
    keyId,
    version: 1,
    algorithm: 'AES-256-GCM',
    iv,
    tag,
    ciphertext,
  };
}

export interface MigrationResult {
  value: string;
  migratedValue: string;
  migrated: boolean;
  neededMigration: boolean;
  isEncrypted: boolean;
  error?: string;
}

/**
 * Encrypts a sensitive plaintext field using AES-256-GCM with a unique 12-byte IV,
 * 16-byte authentication tag, and optional Authenticated Additional Data (AAD).
 */
export async function encryptSensitiveField(
  plaintext: string,
  contextOrField?: { recordId?: string; field?: string } | string,
  recordIdOrProvider?: string | IKeyProvider,
  explicitProvider?: IKeyProvider
): Promise<string> {
  if (typeof plaintext !== 'string') {
    throw new Error('encryptSensitiveField: plaintext must be a string.');
  }

  let context: { recordId?: string; field?: string } | undefined;
  let provider: IKeyProvider;

  if (typeof contextOrField === 'string') {
    context = {
      field: contextOrField,
      recordId: typeof recordIdOrProvider === 'string' ? recordIdOrProvider : undefined,
    };
    provider =
      explicitProvider ||
      (typeof recordIdOrProvider === 'object' &&
      recordIdOrProvider !== null &&
      ('getActiveKey' in (recordIdOrProvider as any) || 'getPrimaryKey' in (recordIdOrProvider as any))
        ? (recordIdOrProvider as IKeyProvider)
        : getKeyProvider());
  } else {
    context = contextOrField;
    provider =
      recordIdOrProvider &&
      typeof recordIdOrProvider === 'object' &&
      ('getActiveKey' in (recordIdOrProvider as any) || 'getPrimaryKey' in (recordIdOrProvider as any))
        ? (recordIdOrProvider as IKeyProvider)
        : explicitProvider || getKeyProvider();
  }

  const activeKey = provider.getActiveKey ? await provider.getActiveKey() : await provider.getPrimaryKey!();

  // Generate unique 12-byte (96-bit) IV per NIST SP 800-38D recommendation for GCM
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', activeKey.rawKey, iv);

  // Bind AAD context if supplied (e.g. recordId:field)
  let aadString: string | undefined = undefined;
  if (context && (context.recordId || context.field)) {
    aadString = `bb:${context.recordId || '*'}:${context.field || '*'}`;
    cipher.setAAD(Buffer.from(aadString, 'utf8'));
  }

  const ciphertextBuf = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  const envelope: EncryptedEnvelope = {
    keyId: activeKey.id,
    version: activeKey.version,
    algorithm: 'AES-256-GCM',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertextBuf.toString('hex'),
    aad: aadString,
  };

  return serializeEnvelope(envelope);
}

/**
 * Decrypts a sensitive ciphertext string or EncryptedEnvelope using AES-256-GCM,
 * validating authentication tag and AAD context. Fails closed upon any tampering.
 */
export async function decryptSensitiveField(
  input: string | EncryptedEnvelope,
  contextOrField?: { recordId?: string; field?: string } | string,
  recordIdOrProvider?: string | IKeyProvider,
  explicitProvider?: IKeyProvider
): Promise<string> {
  let envelope: EncryptedEnvelope | null;

  if (typeof input === 'string') {
    envelope = parseEnvelope(input);
    if (!envelope) {
      throw new DecryptionError('Invalid or corrupted encrypted envelope format.');
    }
  } else if (input && typeof input === 'object') {
    envelope = input;
  } else {
    throw new DecryptionError('Invalid decryption input: expected string envelope or EncryptedEnvelope.');
  }

  let context: { recordId?: string; field?: string } | undefined;
  let provider: IKeyProvider;

  if (typeof contextOrField === 'string') {
    context = {
      field: contextOrField,
      recordId: typeof recordIdOrProvider === 'string' ? recordIdOrProvider : undefined,
    };
    provider =
      explicitProvider ||
      (typeof recordIdOrProvider === 'object' &&
      recordIdOrProvider !== null &&
      ('getKeyById' in (recordIdOrProvider as any) || 'getKey' in (recordIdOrProvider as any))
        ? (recordIdOrProvider as IKeyProvider)
        : getKeyProvider());
  } else {
    context = contextOrField;
    provider =
      recordIdOrProvider &&
      typeof recordIdOrProvider === 'object' &&
      ('getKeyById' in (recordIdOrProvider as any) || 'getKey' in (recordIdOrProvider as any))
        ? (recordIdOrProvider as IKeyProvider)
        : explicitProvider || getKeyProvider();
  }

  const key = provider.getKeyById ? await provider.getKeyById(envelope.keyId) : await provider.getKey!(envelope.keyId);
  if (!key) {
    throw new KeyNotFoundError(envelope.keyId);
  }

  try {
    const iv = Buffer.from(envelope.iv, 'hex');
    const tag = Buffer.from(envelope.tag, 'hex');
    const ciphertext = Buffer.from(envelope.ciphertext, 'hex');

    if (iv.length !== 12 || envelope.iv.length !== 24) {
      throw new DecryptionError(`Invalid IV length: expected 12 bytes (24 hex characters), got ${envelope.iv.length} chars`);
    }
    if (tag.length !== 16 || envelope.tag.length !== 32) {
      throw new DecryptionError(`Invalid tag length: expected 16 bytes (32 hex characters), got ${envelope.tag.length} chars`);
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key.rawKey, iv);

    // Verify AAD if present in envelope or required by context
    if (envelope.aad) {
      decipher.setAAD(Buffer.from(envelope.aad, 'utf8'));
    } else if (context && (context.recordId || context.field)) {
      const expectedAad = `bb:${context.recordId || '*'}:${context.field || '*'}`;
      decipher.setAAD(Buffer.from(expectedAad, 'utf8'));
    }

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(), // Throws if tag or ciphertext or AAD was tampered with
    ]);

    return decrypted.toString('utf8');
  } catch (err: any) {
    if (err instanceof KeyNotFoundError || err instanceof DecryptionError) {
      throw err;
    }
    throw new DecryptionError(
      `Decryption failed: authentication tag mismatch or corrupted ciphertext (${err.message || 'auth failure'}).`
    );
  }
}

/**
 * Migration helper to encrypt legacy plaintext fields or re-encrypt rotated keys.
 * Supports non-destructive dry-run mode.
 */
export async function migrateField(
  currentValue: string,
  contextOrField?: { recordId?: string; field?: string } | string,
  recordIdOrOptions?: string | { dryRun?: boolean; forceReEncrypt?: boolean; provider?: IKeyProvider },
  options?: {
    dryRun?: boolean;
    forceReEncrypt?: boolean;
    provider?: IKeyProvider;
  }
): Promise<MigrationResult> {
  let context: { recordId?: string; field?: string } | undefined;
  let opts: { dryRun?: boolean; forceReEncrypt?: boolean; provider?: IKeyProvider } | undefined;

  if (typeof contextOrField === 'string') {
    context = {
      field: contextOrField,
      recordId: typeof recordIdOrOptions === 'string' ? recordIdOrOptions : undefined,
    };
    opts = typeof recordIdOrOptions === 'object' ? recordIdOrOptions : options;
  } else {
    context = contextOrField;
    opts = typeof recordIdOrOptions === 'object' ? recordIdOrOptions : options;
  }

  const provider = opts?.provider || getKeyProvider();
  const dryRun = opts?.dryRun ?? false;

  try {
    if (isEncryptedString(currentValue)) {
      const envelope = parseEnvelope(currentValue);
      const activeKey = provider.getActiveKey ? await provider.getActiveKey() : await provider.getPrimaryKey!();

      if (envelope && envelope.keyId === activeKey.id && !opts?.forceReEncrypt) {
        // Already encrypted with current active key
        return {
          value: currentValue,
          migratedValue: currentValue,
          migrated: false,
          neededMigration: false,
          isEncrypted: true,
        };
      }

      // Re-encrypt with active key
      if (dryRun) {
        return {
          value: currentValue,
          migratedValue: currentValue,
          migrated: true,
          neededMigration: true,
          isEncrypted: true,
        };
      }

      const plaintext = await decryptSensitiveField(currentValue, context, provider);
      const reEncrypted = await encryptSensitiveField(plaintext, context, provider);
      return {
        value: reEncrypted,
        migratedValue: reEncrypted,
        migrated: true,
        neededMigration: true,
        isEncrypted: true,
      };
    }

    // Currently plaintext: needs migration
    if (dryRun) {
      return {
        value: currentValue,
        migratedValue: currentValue,
        migrated: true,
        neededMigration: true,
        isEncrypted: false,
      };
    }

    const encrypted = await encryptSensitiveField(currentValue, context, provider);
    return {
      value: encrypted,
      migratedValue: encrypted,
      migrated: true,
      neededMigration: true,
      isEncrypted: true,
    };
  } catch (err: any) {
    return {
      value: currentValue,
      migratedValue: currentValue,
      migrated: false,
      neededMigration: false,
      isEncrypted: isEncryptedString(currentValue),
      error: `Migration failure: ${err?.message || 'unknown error'}`,
    };
  }
}
