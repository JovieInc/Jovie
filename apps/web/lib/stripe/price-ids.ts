import 'server-only';

import { env } from '@/lib/env-server';
import {
  getStripePriceIdsFromEnv,
  type StripePriceIds,
} from './price-id-mapping';

export type { StripePriceEnvKey, StripePriceIds } from './price-id-mapping';
export { LEGACY_STRIPE_PRICE_IDS } from './price-id-mapping';

export function getStripePriceIds(): StripePriceIds {
  return getStripePriceIdsFromEnv(env);
}
