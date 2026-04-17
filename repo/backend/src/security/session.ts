import { randomBytes, createHash } from 'node:crypto';

const TOKEN_BYTES = 32; // 64-character hex string

/**
 * Generate a cryptographically random opaque session token.
 * This value is returned to the client once and never persisted in plaintext.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Derive a SHA-256 hash of a session token for database storage.
 * Prevents token exposure if the sessions table is dumped.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Check whether a session record is currently valid.
 * A session is invalid if it has been revoked, has expired,
 * or was issued under a now-superseded password version.
 */
export function isSessionValid(
  session: {
    expiresAt: Date;
    revokedAt: Date | null;
    passwordVersion: number;
  },
  currentPasswordVersion: number,
  now: Date = new Date(),
): boolean {
  if (session.revokedAt !== null) return false;
  if (now >= session.expiresAt) return false;
  if (session.passwordVersion !== currentPasswordVersion) return false;
  return true;
}

/**
 * Compute the absolute expiry Date from now + timeoutHours.
 */
export function computeSessionExpiry(timeoutHours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + timeoutHours * 60 * 60 * 1000);
}
