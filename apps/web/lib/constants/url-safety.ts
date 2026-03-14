/**
 * Canonical low-level URL safety constants shared across validation surfaces.
 */

export const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc[\da-f]{2}:/i,
  /^fd[\da-f]{2}:/i,
  /^fe80:/i,
  /^::ffff:(127\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/i,
  /^\[::1\]$/,
  /^\[fe80:/i,
  /^\[fc[\da-f]{2}:/i,
  /^\[fd[\da-f]{2}:/i,
] as const;

export const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
  '127.0.0.1',
  '::1',
]);

export const INTERNAL_DOMAIN_SUFFIXES = [
  '.internal',
  '.local',
  '.localhost',
  '.localdomain',
] as const;

export const METADATA_HOSTNAMES = new Set([
  '169.254.169.254',
  'metadata.google.internal',
]);

export function isPrivateIpAddress(hostname: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
}
