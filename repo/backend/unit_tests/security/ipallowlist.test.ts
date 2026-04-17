import { describe, it, expect } from 'vitest';
import {
  ipv4ToUint32,
  isIpInCidr,
  isIpAllowed,
} from '../../src/security/ipallowlist.js';

describe('ipv4ToUint32', () => {
  it('converts 0.0.0.0 to 0', () => {
    expect(ipv4ToUint32('0.0.0.0')).toBe(0);
  });

  it('converts 255.255.255.255 to max uint32', () => {
    expect(ipv4ToUint32('255.255.255.255')).toBe(0xffffffff);
  });

  it('converts 192.168.1.1 correctly', () => {
    expect(ipv4ToUint32('192.168.1.1')).toBe((192 << 24 | 168 << 16 | 1 << 8 | 1) >>> 0);
  });

  it('throws on malformed IP', () => {
    expect(() => ipv4ToUint32('notanip')).toThrow();
    expect(() => ipv4ToUint32('256.0.0.1')).toThrow();
    expect(() => ipv4ToUint32('192.168.1')).toThrow();
    expect(() => ipv4ToUint32('192.168.1.1.1')).toThrow();
  });
});

describe('isIpInCidr', () => {
  it('matches the network address itself', () => {
    expect(isIpInCidr('192.168.1.0', '192.168.1.0/24')).toBe(true);
  });

  it('matches an address in the subnet', () => {
    expect(isIpInCidr('192.168.1.100', '192.168.1.0/24')).toBe(true);
  });

  it('matches the broadcast address', () => {
    expect(isIpInCidr('192.168.1.255', '192.168.1.0/24')).toBe(true);
  });

  it('rejects an address outside the subnet', () => {
    expect(isIpInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('matches /32 (single host)', () => {
    expect(isIpInCidr('10.0.0.1', '10.0.0.1/32')).toBe(true);
    expect(isIpInCidr('10.0.0.2', '10.0.0.1/32')).toBe(false);
  });

  it('matches /0 (all IPs)', () => {
    expect(isIpInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(isIpInCidr('255.255.255.255', '0.0.0.0/0')).toBe(true);
  });

  it('returns false on invalid CIDR prefix length', () => {
    expect(isIpInCidr('10.0.0.1', '10.0.0.0/33')).toBe(false);
    expect(isIpInCidr('10.0.0.1', '10.0.0.0/-1')).toBe(false);
  });

  it('returns false on a malformed IP', () => {
    expect(isIpInCidr('notanip', '192.168.1.0/24')).toBe(false);
  });

  it('handles exact-IP cidr with no prefix', () => {
    expect(isIpInCidr('10.0.0.1', '10.0.0.1')).toBe(true);
    expect(isIpInCidr('10.0.0.2', '10.0.0.1')).toBe(false);
  });
});

describe('isIpAllowed', () => {
  it('allows all IPs when allowlist is empty', () => {
    expect(isIpAllowed('1.2.3.4', [])).toBe(true);
  });

  it('allows all IPs when no entries are active', () => {
    expect(
      isIpAllowed('1.2.3.4', [{ cidr: '10.0.0.0/8', isActive: false }]),
    ).toBe(true);
  });

  it('allows an IP that matches an active entry', () => {
    expect(
      isIpAllowed('192.168.1.50', [
        { cidr: '192.168.1.0/24', isActive: true },
      ]),
    ).toBe(true);
  });

  it('rejects an IP that does not match any active entry', () => {
    expect(
      isIpAllowed('10.0.0.1', [{ cidr: '192.168.1.0/24', isActive: true }]),
    ).toBe(false);
  });

  it('allows if any of multiple entries matches', () => {
    expect(
      isIpAllowed('172.16.5.1', [
        { cidr: '10.0.0.0/8', isActive: true },
        { cidr: '172.16.0.0/12', isActive: true },
      ]),
    ).toBe(true);
  });

  it('denies when failClosed=true and no active entries configured', () => {
    expect(isIpAllowed('1.2.3.4', [], { failClosed: true })).toBe(false);
    expect(
      isIpAllowed('1.2.3.4', [{ cidr: '10.0.0.0/8', isActive: false }], {
        failClosed: true,
      }),
    ).toBe(false);
  });

  it('still evaluates active entries under failClosed mode', () => {
    expect(
      isIpAllowed('10.0.0.5', [{ cidr: '10.0.0.0/8', isActive: true }], {
        failClosed: true,
      }),
    ).toBe(true);
    expect(
      isIpAllowed('1.2.3.4', [{ cidr: '10.0.0.0/8', isActive: true }], {
        failClosed: true,
      }),
    ).toBe(false);
  });
});
