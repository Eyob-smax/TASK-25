import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  wrapPasswordHash,
  unwrapPasswordHash,
  verifyWrappedPassword,
} from '../../src/security/password.js';
import { parseMasterKey } from '../../src/security/encryption.js';

describe('hashPassword', () => {
  it('returns a string with 6 colon-separated parts', async () => {
    const hash = await hashPassword('correcthorsebatterystaple');
    expect(hash.split(':').length).toBe(6);
  });

  it('starts with version prefix "1"', async () => {
    const hash = await hashPassword('testpassword1');
    expect(hash.startsWith('1:')).toBe(true);
  });

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await hashPassword('samepassword');
    const h2 = await hashPassword('samepassword');
    expect(h1).not.toBe(h2);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct password', async () => {
    const hash = await hashPassword('MySecretPass1!');
    expect(await verifyPassword('MySecretPass1!', hash)).toBe(true);
  });

  it('returns false for a wrong password', async () => {
    const hash = await hashPassword('MySecretPass1!');
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('returns false for an empty string', async () => {
    const hash = await hashPassword('MySecretPass1!');
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('returns false for a malformed hash string', async () => {
    expect(await verifyPassword('password', 'notahash')).toBe(false);
    expect(await verifyPassword('password', '')).toBe(false);
    expect(await verifyPassword('password', 'a:b:c:d:e')).toBe(false); // 5 parts
  });

  it('is case-sensitive', async () => {
    const hash = await hashPassword('Password123');
    expect(await verifyPassword('password123', hash)).toBe(false);
  });
});

describe('wrapPasswordHash / unwrapPasswordHash', () => {
  const masterKey = parseMasterKey('a'.repeat(64));

  it('round-trips a scrypt hash through the AES-256-GCM envelope', async () => {
    const scryptHash = await hashPassword('CorrectHorseBattery');
    const wrapped = wrapPasswordHash(scryptHash, masterKey, 1);
    expect(wrapped).not.toBe(scryptHash);
    expect(wrapped.startsWith('1:')).toBe(true);
    expect(wrapped.split(':').length).toBe(4); // version:nonce:tag:ciphertext
    expect(unwrapPasswordHash(wrapped, masterKey)).toBe(scryptHash);
  });

  it('produces different ciphertext each call due to random nonce', async () => {
    const scryptHash = await hashPassword('SamePlaintext');
    const a = wrapPasswordHash(scryptHash, masterKey, 1);
    const b = wrapPasswordHash(scryptHash, masterKey, 1);
    expect(a).not.toBe(b);
  });

  it('embeds the key version so future rotation is supported', async () => {
    const wrapped = wrapPasswordHash(await hashPassword('v7'), masterKey, 7);
    expect(wrapped.startsWith('7:')).toBe(true);
  });

  it('rejects tampered ciphertext via GCM authentication failure', async () => {
    const scryptHash = await hashPassword('Integrity1!');
    const wrapped = wrapPasswordHash(scryptHash, masterKey, 1);
    const parts = wrapped.split(':');
    // flip a byte in the ciphertext to simulate tampering
    const tampered = parts.slice(0, 3).join(':') + ':' + parts[3].slice(0, -2) + (parts[3].slice(-2) === '00' ? 'ff' : '00');
    expect(() => unwrapPasswordHash(tampered, masterKey)).toThrow();
  });
});

describe('verifyWrappedPassword', () => {
  const masterKey = parseMasterKey('b'.repeat(64));

  it('returns true for correct password with wrapped hash', async () => {
    const scryptHash = await hashPassword('MySecret#1');
    const wrapped = wrapPasswordHash(scryptHash, masterKey, 1);
    expect(await verifyWrappedPassword('MySecret#1', wrapped, masterKey)).toBe(true);
  });

  it('returns false for wrong password with wrapped hash', async () => {
    const scryptHash = await hashPassword('MySecret#1');
    const wrapped = wrapPasswordHash(scryptHash, masterKey, 1);
    expect(await verifyWrappedPassword('WrongPass', wrapped, masterKey)).toBe(false);
  });

  it('returns false (does not throw) for malformed storage string', async () => {
    expect(await verifyWrappedPassword('anything', 'not-a-valid-envelope', masterKey)).toBe(false);
  });
});
