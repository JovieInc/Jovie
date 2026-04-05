import { PLAN_PRICES } from '@/lib/config/plan-prices';
import type { PricingOption } from '@/lib/queries';

const MONTHLY_INTERVALS = new Set(['month', 'monthly']);

export const FALLBACK_VERIFIED_PRICE_LABEL = `$${PLAN_PRICES.pro.monthly}/mo`;

export function getPreferredVerifiedPrice(
  options: PricingOption[]
): PricingOption | undefined {
  const monthPrice = options.find(option =>
    MONTHLY_INTERVALS.has(option.interval)
  );
  return monthPrice ?? options[0];
}

export function formatVerifiedPriceLabel(
  option: PricingOption | undefined
): string {
  if (!option) return FALLBACK_VERIFIED_PRICE_LABEL;

  const amount = Number.isFinite(option.amount)
    ? option.amount / 100
    : PLAN_PRICES.pro.monthly;
  const currency = option.currency?.toUpperCase() || 'USD';

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

  return `${formatted}/mo`;
}
