/**
 * Convert a dotted-decimal IPv4 string to a 32-bit unsigned integer.
 * Throws on malformed input.
 */
export function ipv4ToUint32(ip: string): number {
  const octets = ip.split('.');
  if (octets.length !== 4) throw new Error(`Invalid IPv4 address: ${ip}`);
  let value = 0;
  for (const octet of octets) {
    const n = parseInt(octet, 10);
    if (isNaN(n) || n < 0 || n > 255 || octet.trim() !== String(n)) {
      throw new Error(`Invalid octet "${octet}" in IPv4 address: ${ip}`);
    }
    value = ((value << 8) | n) >>> 0;
  }
  return value;
}

/**
 * Check whether an IPv4 address falls within a CIDR range.
 * Returns false on any parse error (invalid IP or CIDR) rather than throwing.
 *
 * Accepts an exact IP string with no prefix (treated as /32).
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    if (!cidr.includes('/')) {
      // Exact match
      return ip === cidr;
    }

    const slashIdx = cidr.lastIndexOf('/');
    const networkIp = cidr.slice(0, slashIdx);
    const prefixLen = parseInt(cidr.slice(slashIdx + 1), 10);

    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;

    const ipInt = ipv4ToUint32(ip);
    const netInt = ipv4ToUint32(networkIp);
    // Build a mask of `prefixLen` leading 1-bits
    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;

    return (ipInt & mask) === (netInt & mask);
  } catch {
    return false;
  }
}

export interface AllowlistEntry {
  cidr: string;
  isActive: boolean;
}

/**
 * Check whether an IP address is permitted by a set of allowlist entries.
 *
 * Policy:
 * - Active entries present → IP must match at least one CIDR.
 * - No active entries →
 *     `failClosed: true`  → deny (fail-closed / strict mode, the production default)
 *     `failClosed: false` → allow all (explicit opt-out for dev bootstraps)
 *
 * The strict mode is exposed to the route plugin via
 * `AppConfig.ipAllowlistStrictMode` and **defaults to true** (fail-closed).
 * Setting `IP_ALLOWLIST_STRICT_MODE=false` is an explicit opt-out that
 * restores the legacy open-by-default posture — only recommended for
 * fully-offline/air-gapped bootstraps.
 */
export function isIpAllowed(
  ip: string,
  entries: AllowlistEntry[],
  options: { failClosed?: boolean } = {},
): boolean {
  const active = entries.filter((e) => e.isActive);
  if (active.length === 0) return !options.failClosed;
  return active.some((e) => isIpInCidr(ip, e.cidr));
}
