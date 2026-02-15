/**
 * Referral Program Configuration
 *
 * Program Terms:
 * - 50% commission on all paid subscription payments
 * - Commission lasts up to 24 months per referral
 * - Commission only applies while the referred user remains subscribed
 * - One referral code per user, reusable for multiple referrals
 */

/** Commission rate in basis points (5000 = 50%) */
export const DEFAULT_COMMISSION_RATE_BPS = 5000;

/** Maximum months commission is paid per referral */
export const DEFAULT_COMMISSION_DURATION_MONTHS = 24;

/** Minimum characters for a custom referral code */
export const MIN_REFERRAL_CODE_LENGTH = 3;

/** Maximum characters for a referral code */
export const MAX_REFERRAL_CODE_LENGTH = 32;

/** Regex pattern for valid referral codes (alphanumeric + hyphens) */
export const REFERRAL_CODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/;

/**
 * Calculate commission amount in cents from a payment amount
 */
export function calculateCommission(
  paymentAmountCents: number,
  commissionRateBps: number
): number {
  return Math.round((paymentAmountCents * commissionRateBps) / 10000);
}

/**
 * Calculate the commission expiry date from when the referred user subscribed
 */
export function calculateExpiryDate(
  subscribedAt: Date,
  durationMonths: number
): Date {
  const expiry = new Date(subscribedAt);
  expiry.setMonth(expiry.getMonth() + durationMonths);
  return expiry;
}

/**
 * Check if a commission period is still active
 */
export function isCommissionActive(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() < expiresAt;
}

/**
 * Format commission rate for display (e.g., 5000 bps → "50%")
 */
export function formatCommissionRate(rateBps: number): string {
  return `${(rateBps / 100).toFixed(0)}%`;
}
