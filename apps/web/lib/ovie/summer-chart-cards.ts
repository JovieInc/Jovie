/**
 * Pure builders for the inline charts Summer asks for in Ovie chat. Every
 * value comes from the source read passed in; an unavailable source yields an
 * explicit unavailable card, never zero.
 */

import type { AdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import {
  NOT_MEASURED_LABEL,
  SUMMER_OPS_CARD_SCHEMA,
  type SummerOpsCard,
} from '@/lib/ovie/ops-card';

type FunnelStage = {
  readonly label: string;
  readonly count: number;
};

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function buildRevenueChartCard(
  stripe: Pick<
    AdminStripeOverviewMetrics,
    | 'isAvailable'
    | 'mrrUsd'
    | 'mrrUsd30dAgo'
    | 'mrrUsd7dAgo'
    | 'activeSubscribers'
  > | null,
  observedAt: Date
): SummerOpsCard {
  if (!stripe?.isAvailable) {
    return {
      schema: SUMMER_OPS_CARD_SCHEMA,
      kind: 'revenue',
      title: 'Revenue',
      summary: 'Stripe could not be read just now.',
      state: 'unavailable',
      observedAt: observedAt.toISOString(),
      source: 'Stripe',
      facts: [{ label: 'MRR', value: NOT_MEASURED_LABEL }],
      series: null,
    };
  }
  const points = [
    { label: '30 days ago', value: Math.max(0, stripe.mrrUsd30dAgo) },
    ...(stripe.mrrUsd7dAgo === undefined
      ? []
      : [{ label: '7 days ago', value: Math.max(0, stripe.mrrUsd7dAgo) }]),
    { label: 'Now', value: Math.max(0, stripe.mrrUsd) },
  ];
  return {
    schema: SUMMER_OPS_CARD_SCHEMA,
    kind: 'revenue',
    title: 'Revenue',
    state: 'fresh',
    observedAt: observedAt.toISOString(),
    source: 'Stripe',
    facts: [
      { label: 'MRR', value: usd.format(stripe.mrrUsd) },
      { label: 'Paying', value: String(stripe.activeSubscribers) },
      { label: '30 days ago', value: usd.format(stripe.mrrUsd30dAgo) },
    ],
    series: { label: 'MRR', unit: 'USD', points },
  };
}

export function buildUsersChartCard(
  funnel: {
    readonly stages: readonly FunnelStage[];
    readonly errors: readonly string[];
  } | null,
  observedAt: Date
): SummerOpsCard {
  const stages = funnel?.stages.filter(stage => stage.label.trim()) ?? [];
  if (!funnel || stages.length === 0 || funnel.errors.length > 0) {
    return {
      schema: SUMMER_OPS_CARD_SCHEMA,
      kind: 'cohort',
      title: 'Users, last 7 days',
      summary: 'The signup funnel could not be read just now.',
      state: 'unavailable',
      observedAt: observedAt.toISOString(),
      source: 'Jovie database',
      facts: [{ label: 'Signups', value: NOT_MEASURED_LABEL }],
      series: null,
    };
  }
  const shown = stages.slice(0, 12);
  return {
    schema: SUMMER_OPS_CARD_SCHEMA,
    kind: 'cohort',
    title: 'Users, last 7 days',
    state: 'fresh',
    observedAt: observedAt.toISOString(),
    source: 'Jovie database',
    facts: shown.slice(0, 4).map(stage => ({
      label: stage.label.slice(0, 80),
      value: String(Math.max(0, stage.count)),
    })),
    series: {
      label: 'Funnel',
      points: shown.map(stage => ({
        label: stage.label.slice(0, 80),
        value: Math.max(0, stage.count),
      })),
    },
  };
}
