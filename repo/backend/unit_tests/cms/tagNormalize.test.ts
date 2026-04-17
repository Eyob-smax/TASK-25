import { describe, it, expect } from 'vitest';
import { normalizeTagName } from '../../src/shared/invariants.js';

describe('normalizeTagName', () => {
  it('lowercases uppercase input', () => {
    expect(normalizeTagName('HELLO')).toBe('hello');
  });

  it('lowercases mixed case', () => {
    expect(normalizeTagName('Hello World')).toBe('hello world');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeTagName('  hello  world  ')).toBe('hello world');
  });

  it('collapses internal whitespace to single space', () => {
    expect(normalizeTagName('hello   world')).toBe('hello world');
  });

  it('leaves already-lowercase input unchanged', () => {
    expect(normalizeTagName('already-lowercase')).toBe('already-lowercase');
  });

  it('returns empty string for all-whitespace input', () => {
    expect(normalizeTagName('  ')).toBe('');
  });

  it('leaves a simple lowercase word unchanged', () => {
    expect(normalizeTagName('hello')).toBe('hello');
  });
});
