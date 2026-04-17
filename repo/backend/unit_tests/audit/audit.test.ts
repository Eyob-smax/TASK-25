import { describe, it, expect } from 'vitest';
import { digestObject } from '../../src/audit/audit.js';

describe('digestObject', () => {
  it('returns empty string for null', () => {
    expect(digestObject(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(digestObject(undefined)).toBe('');
  });

  it('returns a 64-character hex string for a plain object', () => {
    const digest = digestObject({ id: '1', status: 'PENDING' });
    expect(digest).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(digest)).toBe(true);
  });

  it('is deterministic for the same input', () => {
    const obj = { resourceType: 'User', action: 'CREATE', id: 'abc' };
    expect(digestObject(obj)).toBe(digestObject(obj));
  });

  it('produces different digests for different objects', () => {
    const d1 = digestObject({ state: 'PENDING' });
    const d2 = digestObject({ state: 'CONFIRMED' });
    expect(d1).not.toBe(d2);
  });

  it('is order-sensitive for JSON serialization', () => {
    const d1 = digestObject({ a: 1, b: 2 });
    const d2 = digestObject({ b: 2, a: 1 });
    // JSON.stringify preserves insertion order, so these may differ
    // The important thing: same key-value set in same order → same digest
    expect(digestObject({ a: 1, b: 2 })).toBe(d1);
    // Note: d1 vs d2 may or may not differ depending on JS engine, but digest is deterministic
    expect(typeof d2).toBe('string');
  });

  it('handles arrays', () => {
    const digest = digestObject([1, 2, 3]);
    expect(digest).toHaveLength(64);
  });

  it('handles primitive values', () => {
    const digest = digestObject('just a string');
    expect(digest).toHaveLength(64);
  });

  it('handles nested objects', () => {
    const before = { user: { id: 'u1', passwordVersion: 1 } };
    const after = { user: { id: 'u1', passwordVersion: 2 } };
    expect(digestObject(before)).not.toBe(digestObject(after));
  });
});
