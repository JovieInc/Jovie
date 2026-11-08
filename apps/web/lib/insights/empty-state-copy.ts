/**
 * Honest copy for the Insights workspace when it has nothing to show.
 *
 * Generation silently returned zero insights for profiles under the click
 * threshold, so pressing Generate Insights looked like it did nothing. This
 * names the threshold up front and, after a short run, the real count.
 */

import { getPlanDisplayName } from '@/lib/entitlements/registry';
import {
  GENERATION_COOLDOWN_HOURS,
  MIN_TOTAL_CLICKS,
} from '@/lib/services/insights/thresholds';
import type { InsightGenerateResponse } from '@/types/insights';

export type InsightsEmptyMode =
  | 'start'
  | 'needs-activity'
  | 'nothing-new'
  | 'failed'
  | 'rate-limited'
  | 'needs-plan'
  | 'category-empty';

/** Why the last Generate press failed, read from the API's error status. */
export interface InsightsGenerateFailure {
  readonly status: number | null;
  /** ISO time the cooldown ends, sent with a 429. */
  readonly nextAllowedAt?: string | null;
}

export interface InsightsEmptyCopy {
  readonly mode: InsightsEmptyMode;
  readonly heading: string;
  readonly description: string;
}

function clicks(count: number): string {
  return `${count.toLocaleString('en-US')} link ${count === 1 ? 'click' : 'clicks'}`;
}

function cooldownWindow(): string {
  return GENERATION_COOLDOWN_HOURS === 1
    ? 'an hour'
    : `${GENERATION_COOLDOWN_HOURS} hours`;
}

function cooldownEnd(nextAllowedAt: string | null | undefined): string | null {
  if (!nextAllowedAt) return null;
  const at = new Date(nextAllowedAt);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function failureCopy(failure: InsightsGenerateFailure): InsightsEmptyCopy {
  if (failure.status === 429) {
    const end = cooldownEnd(failure.nextAllowedAt);
    return {
      mode: 'rate-limited',
      heading: 'Insights Are Cooling Down',
      description: end
        ? `Insights refresh on a cooldown so each run has new data to read. You can generate again after ${end}.`
        : 'Insights refresh on a cooldown so each run has new data to read. Try again later.',
    };
  }
  if (failure.status === 403) {
    return {
      mode: 'needs-plan',
      heading: `Insights Need ${getPlanDisplayName('pro')}`,
      description: `AI insights are part of the ${getPlanDisplayName('pro')} plan. Upgrade to have Jovie read your visits and clicks and write up what to try next.`,
    };
  }
  return {
    mode: 'failed',
    heading: 'Insights Did Not Generate',
    description:
      'Something went wrong while reading your analytics. Nothing was lost, so try again.',
  };
}

export function getInsightsEmptyCopy({
  lastRun,
  generateFailed,
  generateFailure,
  categoryLabel,
}: {
  readonly lastRun?: Pick<
    InsightGenerateResponse,
    'insightsGenerated' | 'dataPointsAnalyzed'
  > | null;
  readonly generateFailed?: boolean;
  /** Status of the failed Generate press; without it a failure reads as generic. */
  readonly generateFailure?: InsightsGenerateFailure | null;
  /** Set when a category filter is on, so the copy speaks to that filter. */
  readonly categoryLabel?: string | null;
}): InsightsEmptyCopy {
  if (generateFailure || generateFailed) {
    return failureCopy(generateFailure ?? { status: null });
  }

  if (categoryLabel) {
    return {
      mode: 'category-empty',
      heading: `No ${categoryLabel} Insights Yet`,
      description: `Nothing in ${categoryLabel} right now. Other categories may still have insights.`,
    };
  }

  if (
    lastRun &&
    lastRun.insightsGenerated === 0 &&
    lastRun.dataPointsAnalyzed < MIN_TOTAL_CLICKS
  ) {
    return {
      mode: 'needs-activity',
      heading: 'Not Enough Activity Yet',
      description: `Insights start at ${clicks(MIN_TOTAL_CLICKS)}, and your profile has ${clicks(lastRun.dataPointsAnalyzed)} so far. Share it, then generate again once more fans visit.`,
    };
  }

  if (lastRun && lastRun.insightsGenerated === 0) {
    return {
      mode: 'nothing-new',
      heading: 'Nothing New To Report',
      // Every completed run starts the server cooldown, so this copy offers
      // no Generate button: pressing it now would only return a 429.
      description: `Jovie read ${clicks(lastRun.dataPointsAnalyzed)} and found no change worth flagging. Insights can run again in ${cooldownWindow()}, so share a release or your profile in the meantime.`,
    };
  }

  return {
    mode: 'start',
    heading: 'No Insights Yet',
    description: `Jovie reads your profile visits and clicks, then writes up what changed and what to try next. It needs at least ${clicks(MIN_TOTAL_CLICKS)} to learn from.`,
  };
}
