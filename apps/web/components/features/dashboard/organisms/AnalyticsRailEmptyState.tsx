'use client';

// @coverage-via apps/web/components/features/dashboard/organisms/AnalyticsSidebar.test.tsx

import { ChartColumn } from 'lucide-react';
import { EmptyState } from '@/components/molecules/EmptyState';
import { APP_ROUTES } from '@/constants/routes';
import { describeNoAudienceActivity } from '@/lib/analytics/audience-activity';
import type { AnalyticsRange } from '@/types/analytics';

/**
 * What a new artist sees in the analytics rail before anyone has visited:
 * one calm empty state with a single next step, in place of a funnel of
 * zeros, two zero tiles and four empty tabs.
 */
export function AnalyticsRailEmptyState({
  range,
}: {
  readonly range: AnalyticsRange;
}) {
  return (
    <EmptyState
      icon={<ChartColumn className='h-5 w-5' strokeWidth={1.75} />}
      heading='No Profile Visits Yet'
      description={describeNoAudienceActivity(range)}
      action={{
        label: 'Share Your Profile',
        href: APP_ROUTES.CHAT_PROFILE_PANEL,
      }}
      className='min-h-80'
      testId='analytics-rail-empty-state'
    />
  );
}
