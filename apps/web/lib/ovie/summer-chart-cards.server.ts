import 'server-only';

import { getFounderFunnelData } from '@/lib/admin/founder-funnel';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import type { SummerOpsCard } from '@/lib/ovie/ops-card';
import {
  buildRevenueChartCard,
  buildUsersChartCard,
} from './summer-chart-cards';
import type { SummerChartMetric } from './summer-chart-directives';

export interface SummerChartReaders {
  readonly stripe: typeof getAdminStripeOverviewMetrics;
  readonly funnel: typeof getFounderFunnelData;
}

const liveReaders: SummerChartReaders = {
  stripe: getAdminStripeOverviewMetrics,
  funnel: getFounderFunnelData,
};

/** Build the card for one registered chart metric from its live source. */
export async function readSummerChartCard(
  metric: SummerChartMetric,
  readers: SummerChartReaders = liveReaders,
  now: Date = new Date()
): Promise<SummerOpsCard> {
  if (metric === 'revenue') {
    const stripe = await readers.stripe().catch(() => null);
    return buildRevenueChartCard(stripe, now);
  }
  const funnel = await readers.funnel('7d').catch(() => null);
  return buildUsersChartCard(funnel, now);
}
