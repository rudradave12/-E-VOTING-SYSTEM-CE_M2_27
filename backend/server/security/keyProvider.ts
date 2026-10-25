/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { SERVER_CONFIG } from '../config';

/**
 * Dedicated 256-bit development key for local testing and academic demo only.
 * MUST NEVER be accepted in production.
 */
export const DETERMINISTIC_DEV_ENCRYPTION_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export const KNOWN_TEST_ENCRYPTION_KEYS = new Set([
  DETERMINISTIC_DEV_ENCRYPTION_KEY.toLowerCase(),
  '0x0000000000000000000000000000000000000000000000000000000000000000',
  '0x1111111111111111111111111111111111111111111111111111111111111111',
]);

export interface EncryptionKey {
  id: string; // e.g. 'bb-enc-v1'
  version: number; // e.g. 1
  rawKey: Buffer; // Exactly 32 bytes for AES-256-GCM
  algorithm: 'AES-256-GCM';
  createdAt: number;
  isRevoked?: boolean;
}

export interface KeyMetadata {
  id: string;
  version: number;
  algorithm: 'AES-256-GCM';
  createdAt: number;
  isRevoked?: boolean;
}

export interface IKeyProvider {
  /**
   * Retrieves the currently active encryption key for write operations.
   */
  getActiveKey(): Promise<EncryptionKey>;
  getPrimaryKey?(): Promise<EncryptionKey>;

  /**
   * Retrieves an encryption key by its identifier (for decrypting historical records).
   */
  getKeyById(id: string): Promise<EncryptionKey | null>;
  getKey?(id: string): Promise<EncryptionKey | null>;

  /**
   * Lists metadata for all registered keys without exposing secret material.
   */
  listKeyMetadata(): Promise<KeyMetadata[]>;
  listKeys?(): Promise<KeyMetadata[]>;

  /**
   * Rotates the active key to a new version, preserving previous keys for read capability.
   */
  rotateKey(newRawKeyHexOrBuffer: string | Buffer, newKeyId?: string): Promise<EncryptionKey>;
}

/**
 * Normalizes a hex or base64 or raw string key into a 32-byte Buffer.
 */
export function normalizeKeyTo32Bytes(rawKey: string | Buffer): Buffer {
  if (Buffer.isBuffer(rawKey)) {
    if (rawKey.length !== 32) {
      throw new Error(`Invalid encryption key length: expected 32 bytes, received ${rawKey.length} bytes.`);
    }
    return rawKey;
  }

  if (typeof rawKey !== 'string') {
    throw new Error('Invalid encryption key type: expected string or Buffer.');
  }

  const trimmed = rawKey.trim();

  // If hex string (e.g. 0x... or 64 hex chars)
  const hexPattern = /^(0x)?[0-9a-fA-F]{64}$/;
  if (hexPattern.test(trimmed)) {
    const cleanHex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    return Buffer.from(cleanHex, 'hex');
  }

  // If base64 string
  try {
    const b64Buf = Buffer.from(trimmed, 'base64');
    if (b64Buf.length === 32) {
      return b64Buf;
    }
  } catch {
    // Ignore base64 parse errors and fallback to length check
  }

  // UTF-8 string with at least 32 characters
  const utf8Buf = Buffer.from(trimmed, 'utf8');
  if (utf8Buf.length === 32) {
    return utf8Buf;
  }

  throw new Error(
    `Invalid encryption key format: expected 64-character hex string (256 bits) or 32 raw bytes.`
  );
}

/**
 * Local Key Provider with versioned envelope encryption support.
 * Operates with local environment keys in development and strict fail-closed
 * validation in production.
 */
export class LocalKeyProvider implements IKeyProvider {
  private keyStore = new Map<string, EncryptionKey>();
  private activeKeyId: string;
  private isProduction: boolean;

  constructor(opts?: {
    initialKey?: string | Buffer;
    primaryKey?: string | Buffer;
    initialKeyId?: string;
    primaryKeyId?: string;
    isProduction?: boolean;
  }) {
    this.isProduction =
      opts?.isProduction !== undefined
        ? opts.isProduction
        : (process.env.NODE_ENV || SERVER_CONFIG.NODE_ENV) === 'production';

    const defaultKeyId = opts?.primaryKeyId || opts?.initialKeyId || 'bb-enc-v1';
    const rawKeyInput = opts?.primaryKey || opts?.initialKey;
    let rawKeyBuffer: Buffer;

    if (rawKeyInput) {
      rawKeyBuffer = normalizeKeyTo32Bytes(rawKeyInput);
    } else {
      const envKey = process.env.APP_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY;
      if (this.isProduction) {
        if (!envKey) {
          throw new Error('Production startup aborted: APP_ENCRYPTION_KEY must be configured.');
        }
        if (KNOWN_TEST_ENCRYPTION_KEYS.has(envKey.trim().toLowerCase())) {
          throw new Error('Production startup aborted: cannot use a known development encryption key.');
        }
        rawKeyBuffer = normalizeKeyTo32Bytes(envKey);
      } else {
        // Non-production fallback
        rawKeyBuffer = normalizeKeyTo32Bytes(envKey || DETERMINISTIC_DEV_ENCRYPTION_KEY);
      }
    }

    const initialKey: EncryptionKey = {
      id: defaultKeyId,
      version: 1,
      rawKey: rawKeyBuffer,
      algorithm: 'AES-256-GCM',
      createdAt: Date.now(),
      isRevoked: false,
    };

    this.keyStore.set(defaultKeyId, initialKey);
    this.activeKeyId = defaultKeyId;
  }

  public async getActiveKey(): Promise<EncryptionKey> {
    const key = this.keyStore.get(this.activeKeyId);
    if (!key || key.isRevoked) {
      throw new Error(`Active encryption key '${this.activeKeyId}' is unavailable or revoked.`);
    }
    return key;
  }

  public async getPrimaryKey(): Promise<EncryptionKey> {
    return this.getActiveKey();
  }

  public async getKeyById(id: string): Promise<EncryptionKey | null> {
    const key = this.keyStore.get(id);
    if (!key) return null;
    return key;
  }

  public async getKey(id: string): Promise<EncryptionKey | null> {
    return this.getKeyById(id);
  }

  public async listKeyMetadata(): Promise<KeyMetadata[]> {
    return Array.from(this.keyStore.values()).map((k) => ({
      id: k.id,
      version: k.version,
      algorithm: k.algorithm,
      createdAt: k.createdAt,
      isRevoked: k.isRevoked,
    }));
  }

  public async listKeys(): Promise<KeyMetadata[]> {
    return this.listKeyMetadata();
  }

  public async rotateKey(newRawKeyHexOrBuffer: string | Buffer, newKeyId?: string): Promise<EncryptionKey> {
    const rawKeyBuffer = normalizeKeyTo32Bytes(newRawKeyHexOrBuffer);

    if (this.isProduction) {
      const hex = `0x${rawKeyBuffer.toString('hex')}`.toLowerCase();
      if (KNOWN_TEST_ENCRYPTION_KEYS.has(hex)) {
        throw new Error('Cannot rotate to a known development or test key in production.');
      }
    }

    const currentKey = await this.getActiveKey();
    const nextVersion = currentKey.version + 1;
    const keyId = newKeyId || `bb-enc-v${nextVersion}`;

    if (this.keyStore.has(keyId)) {
      throw new Error(`Key identifier '${keyId}' already exists in key registry.`);
    }

    const newKey: EncryptionKey = {
      id: keyId,
      version: nextVersion,
      rawKey: rawKeyBuffer,
      algorithm: 'AES-256-GCM',
      createdAt: Date.now(),
      isRevoked: false,
    };

    this.keyStore.set(keyId, newKey);
    this.activeKeyId = keyId;

    return newKey;
  }

  /**
   * Registers a historical key for reading legacy data encrypted under a previous key.
   */
  public registerHistoricalKey(key: EncryptionKey): void {
    if (!key.id || !key.rawKey || key.rawKey.length !== 32) {
      throw new Error('Invalid historical key definition.');
    }
    this.keyStore.set(key.id, key);
  }
}

/**
 * Singleton key provider instance for the application runtime.
 */
let defaultKeyProviderInstance: IKeyProvider | null = null;

export function getKeyProvider(): IKeyProvider {
  if (!defaultKeyProviderInstance) {
    defaultKeyProviderInstance = new LocalKeyProvider();
  }
  return defaultKeyProviderInstance;
}

export function setKeyProviderForTesting(provider: IKeyProvider | null): void {
  defaultKeyProviderInstance = provider;
}
