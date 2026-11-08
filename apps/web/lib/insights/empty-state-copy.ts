/**
 * Honest copy for the Insights workspace when it has nothing to show.
 *
 * Generation silently returned zero insights for profiles under the click
 * threshold, so pressing Generate Insights looked like it did nothing. This
 * names the threshold up front and, after a short run, the real count.
 */

import { MIN_TOTAL_CLICKS } from '@/lib/services/insights/thresholds';
import type { InsightGenerateResponse } from '@/types/insights';

export type InsightsEmptyMode =
  | 'start'
  | 'needs-activity'
  | 'nothing-new'
  | 'failed';

export interface InsightsEmptyCopy {
  readonly mode: InsightsEmptyMode;
  readonly heading: string;
  readonly description: string;
}

function clicks(count: number): string {
  return `${count.toLocaleString('en-US')} link ${count === 1 ? 'click' : 'clicks'}`;
}

export function getInsightsEmptyCopy({
  lastRun,
  generateFailed,
}: {
  readonly lastRun?: Pick<
    InsightGenerateResponse,
    'insightsGenerated' | 'dataPointsAnalyzed'
  > | null;
  readonly generateFailed?: boolean;
}): InsightsEmptyCopy {
  if (generateFailed) {
    return {
      mode: 'failed',
      heading: 'Insights Did Not Generate',
      description:
        'Something went wrong while reading your analytics. Nothing was lost, so try again.',
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
      description: `Jovie read ${clicks(lastRun.dataPointsAnalyzed)} and found no change worth flagging. Generate again after your next release or share.`,
    };
  }

  return {
    mode: 'start',
    heading: 'No Insights Yet',
    description: `Jovie reads your profile visits and clicks, then writes up what changed and what to try next. It needs at least ${clicks(MIN_TOTAL_CLICKS)} to learn from.`,
  };
}
