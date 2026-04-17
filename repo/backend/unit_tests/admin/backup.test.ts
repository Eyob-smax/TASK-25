import { describe, it, expect } from 'vitest';
import { sep, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { validateSnapshotPath } from '../../src/shared/invariants.js';
import { encryptBuffer, decryptBuffer, parseMasterKey } from '../../src/security/encryption.js';

// ---- validateSnapshotPath ----

describe('validateSnapshotPath', () => {
  const backupDir = resolve(tmpdir(), 'greencycle-test-backups');

  it('returns resolved path for a valid filename', () => {
    const result = validateSnapshotPath(backupDir, 'greencycle-backup-2026-04-17.db.enc');
    expect(result).toBe(resolve(backupDir, 'greencycle-backup-2026-04-17.db.enc'));
  });

  it('resolved path starts with backupDir + separator', () => {
    const result = validateSnapshotPath(backupDir, 'snapshot.db.enc');
    expect(result.startsWith(backupDir + sep)).toBe(true);
  });

  it('strips directory components from filename via basename', () => {
    // basename('subdir/file.db.enc') = 'file.db.enc' — safe
    const result = validateSnapshotPath(backupDir, 'subdir/file.db.enc');
    expect(result).toBe(resolve(backupDir, 'file.db.enc'));
  });

  it('neutralises ../ traversal by stripping directories', () => {
    // basename('../../etc/passwd') = 'passwd' — stays inside backupDir
    const result = validateSnapshotPath(backupDir, '../../etc/passwd');
    expect(result).toBe(resolve(backupDir, 'passwd'));
    expect(result.startsWith(backupDir + sep)).toBe(true);
  });

  it('throws on empty string filename', () => {
    expect(() => validateSnapshotPath(backupDir, '')).toThrow('Invalid snapshot filename');
  });

  it('throws on dot filename', () => {
    expect(() => validateSnapshotPath(backupDir, '.')).toThrow('Invalid snapshot filename');
  });

  it('throws on double-dot filename', () => {
    expect(() => validateSnapshotPath(backupDir, '..')).toThrow('Invalid snapshot filename');
  });
});

// ---- encryptBuffer / decryptBuffer round-trip ----

describe('encryptBuffer / decryptBuffer', () => {
  const masterKey = parseMasterKey('ab'.repeat(32));

  it('round-trips an arbitrary Buffer', () => {
    const plaintext = Buffer.from('Hello, GreenCycle backup!', 'utf8');
    const encrypted = encryptBuffer(plaintext, masterKey, 1);
    const decrypted = decryptBuffer(encrypted, masterKey);
    expect(decrypted.toString('utf8')).toBe('Hello, GreenCycle backup!');
  });

  it('produces different ciphertexts for the same plaintext (random nonce)', () => {
    const data = Buffer.from('same data', 'utf8');
    const enc1 = encryptBuffer(data, masterKey, 1);
    const enc2 = encryptBuffer(data, masterKey, 1);
    expect(enc1.equals(enc2)).toBe(false);
  });

  it('embeds the key version as the first 4 bytes (uint32 BE)', () => {
    const data = Buffer.from('test', 'utf8');
    const encrypted = encryptBuffer(data, masterKey, 3);
    expect(encrypted.readUInt32BE(0)).toBe(3);
  });

  it('decrypts correctly when a different version key is used', () => {
    const data = Buffer.from('version test', 'utf8');
    const encrypted = encryptBuffer(data, masterKey, 2);
    const decrypted = decryptBuffer(encrypted, masterKey);
    expect(decrypted.toString('utf8')).toBe('version test');
  });

  it('throws on tampered ciphertext (GCM auth tag failure)', () => {
    const data = Buffer.from('authentic payload', 'utf8');
    const encrypted = encryptBuffer(data, masterKey, 1);
    // Flip a byte in the ciphertext (after the 32-byte header)
    encrypted[32] ^= 0xff;
    expect(() => decryptBuffer(encrypted, masterKey)).toThrow();
  });

  it('throws on data shorter than header size', () => {
    const tooShort = Buffer.alloc(10);
    expect(() => decryptBuffer(tooShort, masterKey)).toThrow();
  });

  it('round-trips an empty buffer', () => {
    const data = Buffer.alloc(0);
    const encrypted = encryptBuffer(data, masterKey, 1);
    const decrypted = decryptBuffer(encrypted, masterKey);
    expect(decrypted.length).toBe(0);
  });

  it('round-trips a large buffer (1 MB)', () => {
    const data = Buffer.alloc(1024 * 1024, 0x42);
    const encrypted = encryptBuffer(data, masterKey, 1);
    const decrypted = decryptBuffer(encrypted, masterKey);
    expect(decrypted.length).toBe(data.length);
    expect(decrypted[0]).toBe(0x42);
    expect(decrypted[decrypted.length - 1]).toBe(0x42);
  });
});
