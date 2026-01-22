/**
 * Network Safety
 *
 * SSRF protection utilities for validating network destinations.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Check if an IPv4 address is in a private range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 0.0.0.0/8 (current network)
  if (a === 0) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}

/**
 * Check if an IPv6 address is in a private range.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 (loopback)
  if (normalized === '::1') return true;
  // fc00::/7 (unique local)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // fe80::/10 (link-local)
  if (normalized.startsWith('fe80')) return true;

  return false;
}

/**
 * Check if an IP address is in a private range.
 */
export function isPrivateIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (!version) return false;

  return version === 4 ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

/**
 * Check if a hostname resolves to a private IP address.
 */
export async function isPrivateHostname(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;

  if (isPrivateIpAddress(lower)) return true;

  try {
    const results = await lookup(lower, { all: true });
    return results.some(result => isPrivateIpAddress(result.address));
  } catch {
    return true;
  }
}
