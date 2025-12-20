'use client';

import { DashboardAnalyticsCards as DashboardAnalyticsCardsOrganism } from '@/components/dashboard/organisms/DashboardAnalyticsCards';
import type { AnalyticsRange } from '@/types/analytics';

type CityRange = Extract<AnalyticsRange, '7d' | '30d' | '90d'>;

interface AnalyticsCardsProps {
  profileUrl?: string;
  range?: CityRange;
  refreshSignal?: number;
}

/**
 * @deprecated This component is a wrapper that forwards to the organism version.
 * For new code, use DashboardAnalyticsCards from organisms directly.
 * This wrapper exists for backward compatibility.
 */
export function AnalyticsCards(props: AnalyticsCardsProps) {
  return <DashboardAnalyticsCardsOrganism {...props} />;
}
