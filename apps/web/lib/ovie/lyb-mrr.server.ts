import 'server-only';

import { env } from '@/lib/env-server';
import {
  type LybDailyMrr,
  parseLybMrrChart,
  parseLybMrrDayResolution,
} from './lyb-mrr';

const DEFINITION = 'active-paid-subscriptions-monthly-normalized-gross';
// Product-owned mapping recorded by LogYourBody RevenueCat provisioning.
const LYB_REVENUECAT_PROJECT_ID = 'proj2385165b';

function missing(state: 'unavailable' | 'unreconciled'): LybDailyMrr {
  return {
    schema: 'jovie.lyb-daily-mrr/v1',
    product: 'logyourbody',
    definition: DEFINITION,
    currency: 'USD',
    asOfDate: null,
    observedAt: null,
    freshnessDeadline: null,
    source: null,
    state,
    mrrCents: null,
  };
}

/** One product-scoped provider measurement shared by Ovie and Summer. */
export async function getLybDailyMrr(
  now = new Date(),
  fetcher: typeof fetch = fetch
): Promise<LybDailyMrr> {
  const key = env.REVENUECAT_LYB_SECRET_API_KEY?.trim();
  if (!key) {
    return missing('unavailable');
  }
  const root = `https://api.revenuecat.com/v2/projects/${LYB_REVENUECAT_PROJECT_ID}/charts/mrr`;
  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };
  let options: Response;
  try {
    options = await fetcher(`${root}/options`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return missing('unavailable');
  }
  if (!options.ok) return missing('unavailable');
  let dayResolution: string;
  try {
    dayResolution = parseLybMrrDayResolution(await options.json());
  } catch {
    return missing('unreconciled');
  }
  const asOfDate = now.toISOString().slice(0, 10);
  const url = new URL(root);
  url.searchParams.set('currency', 'USD');
  url.searchParams.set('realtime', 'true');
  url.searchParams.set('resolution', dayResolution);
  url.searchParams.set('start_date', asOfDate);
  url.searchParams.set('end_date', asOfDate);
  url.searchParams.set(
    'selectors',
    JSON.stringify({ revenue_type: 'revenue' })
  );
  let response: Response;
  try {
    response = await fetcher(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return missing('unavailable');
  }
  if (!response.ok) return missing('unavailable');
  try {
    return parseLybMrrChart(
      await response.json(),
      LYB_REVENUECAT_PROJECT_ID,
      asOfDate,
      now
    );
  } catch {
    return missing('unreconciled');
  }
}
