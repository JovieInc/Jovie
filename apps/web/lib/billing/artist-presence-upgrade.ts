import { APP_ROUTES } from '@/constants/routes';
import { sanitizeRedirectUrl } from '@/lib/auth/constants';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import type { PricingOption } from '@/lib/queries/usePricingOptionsQuery';

/** Only use a validated, unambiguous price for the current monthly offer. */
export function getArtistPresenceMonthlyPrice(
  options: readonly PricingOption[]
): string | undefined {
  const offer = ARTIST_VISIBILITY_OFFER.pro;
  const matches = new Set(
    options
      .filter(
        option =>
          option.amount === toCents(offer.monthlyUsd) &&
          option.currency.toLowerCase() === offer.currency &&
          (option.interval === offer.interval ||
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
