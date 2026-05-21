/**
 * Format profile views count for display in admin tables
 * - Zero values: Display as em dash (—)
 * - Large numbers (≥10k): Abbreviate as "12.5k"
 * - Regular numbers: Format with commas (1,234)
 */
export function formatProfileViews(views: number): string {
  if (views === 0) return '—';
  if (views >= 10000) {
    return `${(views / 1000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat('en-US').format(views);
}

/**
 * Format an amount in cents as a currency string.
 *
 * Uses Intl.NumberFormat for locale-aware formatting with full currency symbol.
 * Defaults to USD when no currency is provided.
 *
 * @param amountCents - The amount in cents (e.g., 500 = $5.00)
 * @param currency - ISO 4217 currency code (defaults to 'USD')
 * @returns Formatted currency string (e.g., "$5.00", "€10.00")
 */
export function formatAmount(amountCents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

/**
 * Format an amount in cents as a whole-dollar currency string (no cents shown).
 *
 * Useful for displaying plan prices like "$39" or "$149" where fractional cents
 * are not meaningful.
 *
 * @param amountCents - The amount in cents (e.g., 3900 = $39)
 * @returns Formatted currency string with no decimal places (e.g., "$39")
 */
export function formatAmountNoCents(amountCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

/**
 * Format a dollar amount (not cents) as a locale-aware currency string.
 *
 * Shows two decimal places for fractional amounts, zero decimals for whole numbers.
 * Client-safe (no server-only imports).
 *
 * @param dollarAmount - The amount in dollars (e.g., 5.5 = $5.50, 10 = $10)
 * @returns Formatted currency string (e.g., "$5.50", "$10")
 */
export function formatDollarAmount(dollarAmount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: dollarAmount % 1 === 0 ? 0 : 2,
    minimumFractionDigits: dollarAmount % 1 === 0 ? 0 : 2,
  }).format(dollarAmount);
}

/**
 * Format an amount in cents as a compact human-readable string.
 *
 * Uses M/K suffixes for large values: $1.2M, $500K, $250.
 * Whole-number M/K values omit the decimal: $2M, $500K.
 *
 * @param amountCents - The amount in cents (e.g., 100000000 = $1,000,000)
 * @returns Compact currency string (e.g., "$1.2M", "$500K", "$250")
 */
export function formatCompactUsd(amountCents: number): string {
  const dollars = amountCents / 100;
  if (dollars >= 1_000_000) {
    const m = dollars / 1_000_000;
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: m % 1 === 0 ? 0 : 1,
      minimumFractionDigits: 0,
    }).format(m);
    return `$${formatted}M`;
  }
  if (dollars >= 1_000) {
    const k = dollars / 1_000;
    const formatted = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: k % 1 === 0 ? 0 : 1,
      minimumFractionDigits: 0,
    }).format(k);
    return `$${formatted}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(dollars));
}
