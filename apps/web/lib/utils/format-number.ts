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
