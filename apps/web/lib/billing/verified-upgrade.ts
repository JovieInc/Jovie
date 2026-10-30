import type { PricingOption } from '@/lib/queries';

const MONTHLY_INTERVALS = new Set(['month', 'monthly']);

export function getPreferredVerifiedPrice(
  options: PricingOption[]
): PricingOption | undefined {
  const monthPrice = options.find(option =>
    MONTHLY_INTERVALS.has(option.interval)
  );
  return monthPrice ?? options[0];
}

/**
 * The price label for the option the person will actually be charged. There
 * is deliberately no list-price fallback: when no option is known the caller
 * shows no price (a list price would contradict a locked person's price).
 */
export function formatVerifiedPriceLabel(
  option: PricingOption | undefined
): string | null {
  if (!option || !Number.isFinite(option.amount)) return null;

  const amount = option.amount / 100;
  const currency = option.currency?.toUpperCase() || 'USD';

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

  return `${formatted}/mo`;
}

/** "Get Verified — <price>", or "Get Verified" until the price is known. */
export function formatVerifiedUpgradeLabel(
  option: PricingOption | undefined
): string {
  const price = formatVerifiedPriceLabel(option);
  return price ? `Get Verified — ${price}` : 'Get Verified';
}
