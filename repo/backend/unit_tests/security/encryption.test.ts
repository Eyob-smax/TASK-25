import { describe, it, expect } from 'vitest';
import {
  deriveKeyForVersion,
  encryptField,
  decryptField,
  serializeEncryptedField,
  parseEncryptedField,
  encryptFieldString,
  decryptFieldString,
  parseMasterKey,
  deriveLookupHash,
} from '../../src/security/encryption.js';

const TEST_MASTER = Buffer.alloc(32, 0xab); // 32 bytes of 0xab for tests

describe('deriveKeyForVersion', () => {
  it('returns a 32-byte buffer', () => {
    const key = deriveKeyForVersion(TEST_MASTER, 1);
    expect(key.length).toBe(32);
  });

  it('produces different keys for different versions', () => {
    const k1 = deriveKeyForVersion(TEST_MASTER, 1);
    const k2 = deriveKeyForVersion(TEST_MASTER, 2);
    expect(k1.toString('hex')).not.toBe(k2.toString('hex'));
  });

  it('is deterministic', () => {
    const k1 = deriveKeyForVersion(TEST_MASTER, 1);
    const k2 = deriveKeyForVersion(TEST_MASTER, 1);
    expect(k1.toString('hex')).toBe(k2.toString('hex'));
  });
});

describe('encryptField / decryptField', () => {
  const key = deriveKeyForVersion(TEST_MASTER, 1);

  it('round-trips a plaintext string', () => {
    const encrypted = encryptField('hello world', key, 1);
    expect(decryptField(encrypted, key)).toBe('hello world');
  });

  it('round-trips an empty string', () => {
    const encrypted = encryptField('', key, 1);
    expect(decryptField(encrypted, key)).toBe('');
  });

  it('round-trips a string with special characters', () => {
    const plaintext = 'member@example.com 💚 résumé';
    const encrypted = encryptField(plaintext, key, 1);
    expect(decryptField(encrypted, key)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random nonce)', () => {
    const e1 = encryptField('same', key, 1);
    const e2 = encryptField('same', key, 1);
    expect(e1.nonce).not.toBe(e2.nonce);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });

  it('throws when decrypting with a wrong key', () => {
    const encrypted = encryptField('secret', key, 1);
    const wrongKey = Buffer.alloc(32, 0x00);
    expect(() => decryptField(encrypted, wrongKey)).toThrow();
  });
});

describe('serializeEncryptedField / parseEncryptedField', () => {
  const key = deriveKeyForVersion(TEST_MASTER, 1);

  it('round-trips through serialize + parse', () => {
    const encrypted = encryptField('test value', key, 1);
    const serialized = serializeEncryptedField(encrypted);
    const parsed = parseEncryptedField(serialized);
    expect(parsed.version).toBe(encrypted.version);
    expect(parsed.nonce).toBe(encrypted.nonce);
    expect(parsed.tag).toBe(encrypted.tag);
    expect(parsed.ciphertext).toBe(encrypted.ciphertext);
  });

  it('throws on malformed stored strings', () => {
    expect(() => parseEncryptedField('onlytwoparts')).toThrow();
    expect(() => parseEncryptedField('1:nonce:tag')).toThrow();
  });
});

describe('encryptFieldString / decryptFieldString', () => {
  it('round-trips using master key', () => {
    const plaintext = '4242424242424242';
    const stored = encryptFieldString(plaintext, TEST_MASTER, 1);
    expect(decryptFieldString(stored, TEST_MASTER)).toBe(plaintext);
  });
});

describe('parseMasterKey', () => {
  it('parses a 64-hex-char key', () => {
    const hex = 'ab'.repeat(32); // 64 chars
    const key = parseMasterKey(hex);
    expect(key.length).toBe(32);
    expect(key[0]).toBe(0xab);
  });

  it('throws for overlength keys', () => {
    const hex = 'cd'.repeat(40); // 80 chars
    expect(() => parseMasterKey(hex)).toThrow(/64 hex characters/);
  });

  it('throws for empty string', () => {
    expect(() => parseMasterKey('')).toThrow(/64 hex characters/);
  });

  it('throws for short strings', () => {
    expect(() => parseMasterKey('deadbeef')).toThrow(/64 hex characters/);
  });

  it('throws for non-hex characters', () => {
    const notHex = 'z'.repeat(64);
    expect(() => parseMasterKey(notHex)).toThrow(/64 hex characters/);
  });
});

describe('deriveLookupHash', () => {
  it('returns a 64-character hex string (SHA-256 output)', () => {
    const hash = deriveLookupHash('M-0001', TEST_MASTER);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same plaintext + key', () => {
    const a = deriveLookupHash('M-0001', TEST_MASTER);
    const b = deriveLookupHash('M-0001', TEST_MASTER);
    expect(a).toBe(b);
  });

  it('produces different hashes for different plaintexts', () => {
    const a = deriveLookupHash('M-0001', TEST_MASTER);
    const b = deriveLookupHash('M-0002', TEST_MASTER);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for different master keys', () => {
    const otherKey = Buffer.alloc(32, 0xcd);
    const a = deriveLookupHash('M-0001', TEST_MASTER);
    const b = deriveLookupHash('M-0001', otherKey);
    expect(a).not.toBe(b);
  });

  it('normalizes surrounding whitespace to prevent trivial uniqueness bypass', () => {
    const a = deriveLookupHash('M-0001', TEST_MASTER);
    const b = deriveLookupHash('  M-0001  ', TEST_MASTER);
    expect(a).toBe(b);
  });
});
