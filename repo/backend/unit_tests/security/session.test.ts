import { describe, it, expect } from 'vitest';
import {
  generateSessionToken,
  hashSessionToken,
  isSessionValid,
  computeSessionExpiry,
} from '../../src/security/session.js';

describe('generateSessionToken', () => {
  it('returns a 64-character lowercase hex string', () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different tokens on each call', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
  });
});

describe('hashSessionToken', () => {
  it('returns a 64-character lowercase hex SHA-256 digest', () => {
    const hash = hashSessionToken('some-token-value');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const a = hashSessionToken('constant');
    const b = hashSessionToken('constant');
    expect(a).toBe(b);
  });

  it('does not return the plaintext token', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it('changes when input changes', () => {
    expect(hashSessionToken('a')).not.toBe(hashSessionToken('b'));
  });
});

describe('isSessionValid', () => {
  const now = new Date('2026-04-17T12:00:00Z');
  const future = new Date('2026-04-17T20:00:00Z');
  const past = new Date('2026-04-17T06:00:00Z');

  it('returns true for an active session with matching password version', () => {
    const session = { expiresAt: future, revokedAt: null, passwordVersion: 1 };
    expect(isSessionValid(session, 1, now)).toBe(true);
  });

  it('returns false if session was revoked', () => {
    const session = { expiresAt: future, revokedAt: past, passwordVersion: 1 };
    expect(isSessionValid(session, 1, now)).toBe(false);
  });

  it('returns false if session is expired', () => {
    const session = { expiresAt: past, revokedAt: null, passwordVersion: 1 };
    expect(isSessionValid(session, 1, now)).toBe(false);
  });

  it('returns false if password version is superseded (rotation)', () => {
    const session = { expiresAt: future, revokedAt: null, passwordVersion: 1 };
    expect(isSessionValid(session, 2, now)).toBe(false);
  });

  it('is inclusive of exact expiry instant — expired at boundary', () => {
    const session = { expiresAt: now, revokedAt: null, passwordVersion: 1 };
    expect(isSessionValid(session, 1, now)).toBe(false);
  });
});

describe('computeSessionExpiry', () => {
  it('adds the configured hours to now', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const expected = new Date('2026-04-17T20:00:00Z');
    expect(computeSessionExpiry(8, now).getTime()).toBe(expected.getTime());
  });

  it('handles fractional-day durations correctly', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const result = computeSessionExpiry(1, now);
    expect(result.getTime() - now.getTime()).toBe(60 * 60 * 1000);
  });

  it('supports very short timeouts', () => {
    const now = new Date();
    const result = computeSessionExpiry(0, now);
    expect(result.getTime()).toBe(now.getTime());
  });
});
