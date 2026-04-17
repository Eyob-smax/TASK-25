import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { encryptFieldString, decryptFieldString } from './encryption.js';

const scryptAsync = promisify(scrypt);

// scrypt cost parameters — tuned for server-side use on Node 20
const SCRYPT_N = 32768; // CPU/memory cost factor
const SCRYPT_R = 8;     // block size
const SCRYPT_P = 1;     // parallelization factor
const KEY_LEN = 64;     // output length in bytes
const SALT_LEN = 16;    // random salt length in bytes

// Stored format: `1:{N}:{r}:{p}:{saltHex}:{hashHex}`
// The leading version number allows future parameter upgrades.

/**
 * Hash a plaintext password with scrypt.
 * Returns a versioned string safe for database storage.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = (await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  })) as Buffer;
  return `1:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a plaintext password against a stored scrypt hash.
 * Uses constant-time comparison to prevent timing side-channels.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 6) return false;

  const [, N, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expectedHash = Buffer.from(hashHex, 'hex');

  if (salt.length === 0 || expectedHash.length === 0) return false;

  try {
    const actualHash = (await scryptAsync(password, salt, expectedHash.length, {
      N: parseInt(N, 10),
      r: parseInt(r, 10),
      p: parseInt(p, 10),
    })) as Buffer;
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

// Envelope wrapping: the scrypt hash itself is treated as plaintext and wrapped
// in an AES-256-GCM envelope using the active key version. The storage format
// for User.passwordHash is therefore `{version}:{nonceHex}:{tagHex}:{ciphertextHex}`
// where the ciphertext decrypts to the canonical scrypt string.

export function wrapPasswordHash(scryptStored: string, masterKey: Buffer, version: number): string {
  return encryptFieldString(scryptStored, masterKey, version);
}

export function unwrapPasswordHash(wrapped: string, masterKey: Buffer): string {
  return decryptFieldString(wrapped, masterKey);
}

export async function verifyWrappedPassword(
  password: string,
  wrapped: string,
  masterKey: Buffer,
): Promise<boolean> {
  try {
    const scryptStored = unwrapPasswordHash(wrapped, masterKey);
    return await verifyPassword(password, scryptStored);
  } catch {
    return false;
  }
}
