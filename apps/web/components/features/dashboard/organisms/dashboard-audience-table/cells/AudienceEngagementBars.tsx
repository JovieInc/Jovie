'use client';

// @coverage-via apps/web/components/features/dashboard/organisms/dashboard-audience-table/cells/AudienceEngagementBars.test.tsx

import { memo } from 'react';
import { MeterCell } from '@/components/organisms/table/cells/MeterCell';

export interface AudienceEngagementBarsProps {
  /** 0-100 engagement score from server */
  readonly score: number;
}

/** Maps the engagement score to the kit's MeterCell. */
export const AudienceEngagementBars = memo(function AudienceEngagementBars({
  score,
}: AudienceEngagementBarsProps) {
  return <MeterCell value={score} max={100} bars={5} label='Engagement' />;
});
