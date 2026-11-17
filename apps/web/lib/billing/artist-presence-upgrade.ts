import { APP_ROUTES } from '@/constants/routes';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import type { PricingOption } from '@/lib/queries/usePricingOptionsQuery';

/** Query options already carry the person's lock; select by plan, not list amount. */
export function getArtistPresenceMonthlyPrice(
  options: readonly PricingOption[]
): string | undefined {
  const matches = new Set(
    options
      .filter(
        option =>
          option.plan === 'pro' &&
          Number.isSafeInteger(option.amount) &&
          option.amount > 0 &&
          option.currency.toLowerCase() === 'usd' &&
          (option.interval === 'month' || option.interval === 'monthly') &&
          option.priceId.trim().length > 0
      )
      .map(option => option.priceId)
  );
  return matches.size === 1 ? [...matches][0] : undefined;
}

/** A checkout return only navigates; normal server entitlements still gate access. */
export function normalizeUpgradeReturnTo(raw: unknown): string {
  const safe = typeof raw === 'string' ? sanitizeRedirectUrl(raw) : null;
  if (!safe) return APP_ROUTES.DASHBOARD;
  const parsed = new URL(safe, 'https://jovie.invalid');
  if (
    parsed.pathname !== APP_ROUTES.DASHBOARD &&
    !parsed.pathname.startsWith(`${APP_ROUTES.DASHBOARD}/`)
  )
    return APP_ROUTES.DASHBOARD;
  return parsed.pathname + parsed.search;
}
