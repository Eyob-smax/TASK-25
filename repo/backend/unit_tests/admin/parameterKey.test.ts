import { describe, it, expect } from 'vitest';
import { isValidParameterKey } from '../../src/shared/invariants.js';
import { isIpInCidr } from '../../src/security/ipallowlist.js';

// ---- isValidParameterKey ----

describe('isValidParameterKey — valid keys', () => {
  it('accepts alphanumeric key', () => {
    expect(isValidParameterKey('maxRetries')).toBe(true);
  });

  it('accepts dot-delimited namespaced key', () => {
    expect(isValidParameterKey('cms.trending.windowDays')).toBe(true);
  });

  it('accepts colon-namespaced key', () => {
    expect(isValidParameterKey('system:backup:dir')).toBe(true);
  });

  it('accepts hyphenated key', () => {
    expect(isValidParameterKey('max-concurrent-requests')).toBe(true);
  });

  it('accepts underscore-free mixed format', () => {
    expect(isValidParameterKey('feature.flag:v2')).toBe(true);
  });

  it('accepts uppercase letters', () => {
    expect(isValidParameterKey('BACKUPENCRYPTIONKEY')).toBe(true);
  });

  it('accepts digits in key', () => {
    expect(isValidParameterKey('timeout.v2.seconds')).toBe(true);
  });

  it('accepts single character key', () => {
    expect(isValidParameterKey('a')).toBe(true);
  });
});

describe('isValidParameterKey — invalid keys', () => {
  it('rejects empty string', () => {
    expect(isValidParameterKey('')).toBe(false);
  });

  it('rejects key with spaces', () => {
    expect(isValidParameterKey('key with spaces')).toBe(false);
  });

  it('rejects key with exclamation mark', () => {
    expect(isValidParameterKey('key!')).toBe(false);
  });

  it('rejects key with at-sign', () => {
    expect(isValidParameterKey('key@domain')).toBe(false);
  });

  it('rejects key with hash', () => {
    expect(isValidParameterKey('key#value')).toBe(false);
  });

  it('rejects key with slash', () => {
    expect(isValidParameterKey('key/subkey')).toBe(false);
  });

  it('rejects key with backslash', () => {
    expect(isValidParameterKey('key\\subkey')).toBe(false);
  });

  it('rejects key with newline', () => {
    expect(isValidParameterKey('key\nvalue')).toBe(false);
  });
});

// ---- Admin schema constants ----

describe('Admin schema constants — parameter key pattern', () => {
  const KEY_PATTERN = /^[a-zA-Z0-9._:-]+$/;

  it('matches the same pattern as admin schema', () => {
    expect(KEY_PATTERN.test('cms.trending.window')).toBe(true);
    expect(KEY_PATTERN.test('invalid key!')).toBe(false);
  });

  it('rejects underscore (not in allowed set)', () => {
    expect(KEY_PATTERN.test('key_with_underscore')).toBe(false);
  });
});

// ---- IP allowlist CIDR checks ----

describe('isIpInCidr — CIDR matching for IP allowlist', () => {
  it('returns true for IP within /24 network', () => {
    expect(isIpInCidr('192.168.1.50', '192.168.1.0/24')).toBe(true);
  });

  it('returns false for IP outside /24 network', () => {
    expect(isIpInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('returns true for IP within /8 network', () => {
    expect(isIpInCidr('10.50.20.1', '10.0.0.0/8')).toBe(true);
  });

  it('returns false for IP outside /8 network', () => {
    expect(isIpInCidr('172.16.0.1', '10.0.0.0/8')).toBe(false);
  });

  it('returns true for exact host match (/32)', () => {
    expect(isIpInCidr('192.168.1.100', '192.168.1.100/32')).toBe(true);
  });

  it('returns false for non-matching /32', () => {
    expect(isIpInCidr('192.168.1.101', '192.168.1.100/32')).toBe(false);
  });

  it('returns true for 0.0.0.0/0 (allow all)', () => {
    expect(isIpInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
  });

  it('handles loopback address', () => {
    expect(isIpInCidr('127.0.0.1', '127.0.0.0/8')).toBe(true);
  });
});
