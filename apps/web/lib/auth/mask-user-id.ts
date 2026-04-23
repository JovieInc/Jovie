import 'server-only';

import crypto from 'node:crypto';

/**
 * Mask a user ID for logging and error-tracking to prevent raw Clerk ID
 * exposure while preserving correlation across audit surfaces.
 *
 * Format: first 4 chars + "..." + 8-char SHA-256 suffix.
 * Same input always yields the same output, so Sentry + server logs line up.
 */
export function maskUserIdForLog(userId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(userId)
    .digest('hex')
    .substring(0, 8);
  return `${userId.substring(0, 4)}...${hash}`;
}
