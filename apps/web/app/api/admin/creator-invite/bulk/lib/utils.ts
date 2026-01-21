/**
 * Bulk Invite Utilities
 *
 * Helper functions for bulk invite processing.
 */

/**
 * Mask an email address for preview display.
 * Preserves domain, masks local part with varying amounts based on length.
 */
export function maskEmail(
  email: string | null | undefined
): string | undefined {
  if (!email) return undefined;

  // Validate email contains exactly one '@'
  const atCount = (email.match(/@/g) || []).length;
  if (atCount !== 1) return undefined;

  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return undefined;

  // For very short local parts (1-2 chars), show first char + ***
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }

  // For longer local parts, show first 2 chars + ***
  return `${localPart.slice(0, 2)}***@${domain}`;
}

/**
 * Calculate effective batch limit based on max per hour constraint.
 * Caps to 2 hours worth of emails to prevent excessively large batches.
 */
export function calculateEffectiveLimit(
  limit: number,
  maxPerHour: number
): number {
  return Math.min(limit, maxPerHour * 2);
}

/**
 * Calculate estimated timing for batch processing.
 */
export function calculateEstimatedTiming(
  profileCount: number,
  minDelayMs: number,
  maxDelayMs: number
): { avgDelayMs: number; estimatedMinutes: number } {
  const avgDelayMs = (minDelayMs + maxDelayMs) / 2;
  const estimatedTotalMs = profileCount * avgDelayMs;
  const estimatedMinutes = Math.ceil(estimatedTotalMs / 60000);

  return { avgDelayMs, estimatedMinutes };
}

/**
 * Parse and validate query parameters for GET endpoint.
 */
export function parsePreviewParams(searchParams: URLSearchParams): {
  fitScoreThreshold: number;
  limit: number;
} {
  const rawThreshold = searchParams.get('threshold');
  const rawLimit = searchParams.get('limit');

  const parsedThreshold = rawThreshold ? Number.parseInt(rawThreshold, 10) : 50;
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : 50;

  // Validate parsed values are finite numbers within expected range
  const fitScoreThreshold =
    Number.isFinite(parsedThreshold) &&
    parsedThreshold >= 0 &&
    parsedThreshold <= 100
      ? parsedThreshold
      : 50;

  const limit =
    Number.isFinite(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, 100)
      : 50;

  return { fitScoreThreshold, limit };
}
