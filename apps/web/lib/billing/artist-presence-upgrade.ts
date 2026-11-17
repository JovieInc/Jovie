import { APP_ROUTES } from '@/constants/routes';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import type { PricingOption } from '@/lib/queries/usePricingOptionsQuery';
import type { PriceLockView } from './price-lock-view';
import { resolveLockedPrice } from './price-versions';

/** Only use a validated, unambiguous price for the current monthly offer. */
export function getArtistPresenceMonthlyPrice(
  options: readonly PricingOption[],
  lock?: PriceLockView | null
): string | undefined {
  const locked = lock?.month;
  if (locked && !locked.priceId) return undefined;
  const expected =
    locked ?? resolveLockedPrice({ lock: null, interval: 'month' });
  if (!expected) return undefined;
  const matches = new Set(
    options
      .filter(
        option =>
          option.plan === 'pro' &&
          (!locked || option.priceId === locked.priceId) &&
          option.amount === expected.amountCents &&
          option.currency.toLowerCase() === expected.currency &&
          (option.interval === expected.interval ||
            option.interval === 'monthly') &&
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
