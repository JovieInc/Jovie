/**
 * Spend-expiry status rules and third-party grant last-used parsing.
 *
 * These lived in credentials-registry.mjs. They moved here so that module
 * stays within its company-guards size ceiling
 * (scripts/company-guards/size-baseline.json) while the checker still owns
 * the behavior: a resolved expiry stops alerting, and an unknown status
 * fails validation closed instead of muting a live deadline.
 */

/** Statuses that no longer alert. Lapsed, redeemed, and superseded are history. */
const RESOLVED_EXPIRY_STATUSES = new Set(['lapsed', 'redeemed', 'superseded']);
const VALID_EXPIRY_STATUSES = new Set(['active', ...RESOLVED_EXPIRY_STATUSES]);

/** @param {{ status?: string }} dated */
export function isResolvedSpendExpiry(dated) {
  return RESOLVED_EXPIRY_STATUSES.has(dated.status);
}

/**
 * @param {{ id?: string, expiries?: Array<{ id?: string, status?: string }> }} entry
 * @returns {string[]}
 */
export function spendExpiryStatusErrors(entry) {
  const errors = [];
  for (const dated of entry.expiries ?? []) {
    if (dated.status !== undefined && !VALID_EXPIRY_STATUSES.has(dated.status))
      errors.push(
        `${entry.id}: ${dated.id}: unknown expiry status ${dated.status}`
      );
  }
  return errors;
}

/** Months implied by GitHub's "Last used within the last N <unit>" text. */
export function lastUsedMonths(text) {
  if (!text) return null;
  if (/never/i.test(text)) return Infinity;
  const match = /(\d+)\s*(week|month|year)/i.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === 'week' ? n / 4.35 : unit === 'year' ? n * 12 : n;
}
