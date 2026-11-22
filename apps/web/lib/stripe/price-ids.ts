import 'server-only';

import { env } from '@/lib/env-server';
import {
  getStripePriceIdsFromEnv,
  resolveArtistVisibilityProMonthlyPriceId,
  type StripePriceIds,
} from './price-id-mapping';

export type { StripePriceEnvKey, StripePriceIds } from './price-id-mapping';
export { LEGACY_STRIPE_PRICE_IDS } from './price-id-mapping';

let warnedArtistVisibilityPriceModeMismatch = false;

export function getStripePriceIds(): StripePriceIds {
  const ids = getStripePriceIdsFromEnv(env);
  const configured = ids.artistVisibilityProMonthly;
  const resolved = resolveArtistVisibilityProMonthlyPriceId({
    configuredPriceId: configured,
    secretKey: env.STRIPE_SECRET_KEY,
  });
  const trimmed = configured?.trim();
  if (
    trimmed &&
    resolved &&
    resolved !== trimmed &&
    !warnedArtistVisibilityPriceModeMismatch
  ) {
    warnedArtistVisibilityPriceModeMismatch = true;
    console.warn(
      `[stripe] STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY ${trimmed} is on the other Stripe account for this secret key; checkout will use ${resolved}.`
    );
  }
  if (resolved === configured) return ids;
  return { ...ids, artistVisibilityProMonthly: resolved };
}
