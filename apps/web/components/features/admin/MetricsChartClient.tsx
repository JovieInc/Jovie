'use client';

import dynamic from 'next/dynamic';
import { ContentChartSkeleton } from '@/components/molecules/ContentChartState';
import { ContentMetricStatSkeleton } from '@/components/molecules/ContentMetricStat';
import type { AdminUsagePoint } from '@/lib/admin/types';

interface MetricsChartClientProps {
  readonly points: AdminUsagePoint[];
}

const METRIC_STAT_SKELETON_KEYS = ['current-dau', 'average', 'peak'] as const;

/**
 * Client-side wrapper for MetricsChart with lazy-loaded Recharts.
 *
 * Recharts is ~100KB and not needed on initial page load for admin dashboard.
 * This component lazy loads it with a loading skeleton for better performance.
 */
const MetricsChartImpl = dynamic(
  () =>
    import('@/features/admin/MetricsChart').then(mod => ({
      default: mod.MetricsChart,
    })),
  {
    loading: () => (
      <div className='space-y-4'>
        <div className='flex items-start justify-between'>
          <div className='space-y-2'>
            <div className='h-4 w-40 rounded skeleton' />
            <div className='h-3 w-24 rounded skeleton' />
          </div>
          <div className='h-4 w-16 rounded skeleton' />
        </div>
        <ContentChartSkeleton label='Loading Daily Active Users Chart' />
        <div className='grid gap-4 sm:grid-cols-3'>
          {METRIC_STAT_SKELETON_KEYS.map(key => (
            <ContentMetricStatSkeleton key={key} />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function MetricsChartClient({
  points,
}: Readonly<MetricsChartClientProps>) {
  return <MetricsChartImpl points={points} />;
}
