/**
 * Network Safety
 *
 * SSRF protection utilities for validating network destinations.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Check if an IP address is in a private range.
 */
export function isPrivateIpAddress(ip: string): boolean {
  const version = isIP(ip);
  if (!version) return false;

  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    return false;
  }

  const normalized = ip.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  return false;
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
