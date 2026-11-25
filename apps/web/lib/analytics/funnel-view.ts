import { z } from 'zod';
import type { FounderFunnelData } from '@/lib/admin/types';
import { readMeasuredDashboardCount } from '@/lib/analytics/evidence-receipt';
import { CANONICAL_METRICS } from '@/lib/analytics/metrics';
import { formatAnalyticsStageRate } from '@/lib/utils/analytics-growth';
import type { DashboardAnalyticsResponse } from '@/types/analytics';

const status = z.enum([
  'verified',
  'failed',
  'blocked',
  'skipped',
  'stale',
  'unknown',
  'measured',
]);

const funnelStageSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  status,
  count: z.number().int().nonnegative().optional(),
  rate: z
    .string()
    .regex(/^\d+(\.\d+)?%$/)
    .optional(),
  detail: z.string().max(2000).optional(),
  evidenceUrl: z.url({ protocol: /^https?$/ }).optional(),
});

export const funnelViewSchema = z
  .object({
    title: z.string().min(1).max(120),
    caption: z.string().max(240).optional(),
    stages: z.array(funnelStageSchema).min(1).max(16),
    bottleneckId: z.string().nullable(),
  })
  .refine(
    view =>
      new Set(view.stages.map(stage => stage.id)).size === view.stages.length &&
      (view.bottleneckId === null ||
        view.stages.some(
          stage =>
            stage.id === view.bottleneckId &&
            ['failed', 'blocked', 'measured'].includes(stage.status)
        ))
  );

export type FunnelView = z.infer<typeof funnelViewSchema>;
export type FunnelStage = z.infer<typeof funnelStageSchema>;

export function audienceFunnelView(
  analytics: DashboardAnalyticsResponse | null | undefined,
  window: string
): FunnelView {
  const visitors = readMeasuredDashboardCount(analytics, 'unique_users');
  const subscribers = readMeasuredDashboardCount(analytics, 'subscribers');
  const audienceStages = [
    {
      id: 'views',
      label: CANONICAL_METRICS.profile_views.label,
      count: readMeasuredDashboardCount(analytics, 'profile_views'),
    },
    {
      id: 'visitors',
      label: CANONICAL_METRICS.unique_users.label,
      count: visitors,
    },
    { id: 'subscribers', label: 'Subscribers', count: subscribers },
  ];
  const captureRatio =
    visitors != null && subscribers != null && subscribers <= visitors
      ? formatAnalyticsStageRate(subscribers, visitors)
      : null;
  return {
    title: 'Audience funnel',
    caption:
      captureRatio === null
        ? window
        : `${window} · Capture ratio is subscribers ÷ unique visitors.`,
    bottleneckId: null,
    stages: audienceStages.map(({ id, label, count }) => ({
      id,
      label,
      status: count == null ? 'unknown' : 'measured',
      count: count ?? undefined,
      rate: id === 'subscribers' ? (captureRatio ?? undefined) : undefined,
    })),
  };
}

export function founderFunnelView(funnel: FounderFunnelData): FunnelView {
  const observationsAvailable = funnel.errors.length === 0;
  const stages = funnel.stages.map((stage, index): FunnelStage => {
    const previous = funnel.stages[index - 1];
    // Anonymous chats cannot be joined to accounts. For the account stages,
    // the producer supplies a shared account cohort, but not ordered journeys.
    const rate =
      observationsAvailable &&
      index > 1 &&
      previous &&
      stage.count <= previous.count
        ? formatAnalyticsStageRate(stage.count, previous.count)
        : null;
    return {
      id: stage.key,
      label: stage.label,
      status: observationsAvailable ? 'measured' : 'unknown',
      count: observationsAvailable ? stage.count : undefined,
      rate: rate ?? undefined,
    };
  });
  return {
    title: 'Customer funnel',
    caption: `${funnel.timeRange === 'all' ? 'All time' : funnel.timeRange} · Account stage ratios to previous stage. Anonymous chats are separate.`,
    stages,
    bottleneckId: null,
  };
}

export function asksForAudienceFunnel(text: string): boolean {
  return /\b(?:audience funnel|conversion(?: rates?)?|funnel|audience bottlenecks?)\b/i.test(
    text
  );
}

export function requestedOpsFunnel(
  text: string
): 'golden-path' | 'customer' | null {
  const question = text.trim();
  if (
    !/^(?:@?summer[,:]?\s+)?(?:show|what|which|where|how|can you show|give me|display|golden[ -]path|(?:customer |onboarding )?funnel|(?:current )?bottlenecks?|conversion rates?)\b/i.test(
      question
    )
  )
    return null;
  if (
    /\b(?:fix|repair|ship|dispatch|deploy|change|build|create|implement|run|investigate)\b/i.test(
      question
    )
  )
    return null;
  if (/\bgolden[ -]path\b/i.test(question)) return 'golden-path';
  if (/\b(?:audience|sales|marketing|recruiting)\b/i.test(question))
    return null;
  if (
    /\b(?:customer|onboarding|signup|growth)\b/i.test(question) &&
    /\b(?:funnel|conversion(?: rates?)?|bottlenecks?)\b/i.test(question)
  )
    return 'customer';
  if (/\b(?:funnel|bottlenecks?)\b/i.test(question)) return 'golden-path';
  return /\bconversion rates?\b/i.test(question) ? 'customer' : null;
}
