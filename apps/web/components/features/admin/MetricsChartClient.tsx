'use client';

import { Skeleton } from '@jovie/ui';
import dynamic from 'next/dynamic';
import type { AdminUsagePoint } from '@/lib/admin/overview';

interface MetricsChartClientProps {
  readonly points: AdminUsagePoint[];
}

const METRICS_CHART_LOADING_CARD_KEYS = Array.from(
  { length: 3 },
  (_, i) => `metrics-loading-card-${i + 1}`
);

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
            <Skeleton className='h-4 w-40 rounded' />
            <Skeleton className='h-3 w-24 rounded' />
          </div>
          <Skeleton className='h-4 w-16 rounded' />
        </div>
        <Skeleton className='h-64 rounded-lg' />
        <div className='grid gap-4 sm:grid-cols-3'>
          {METRICS_CHART_LOADING_CARD_KEYS.map(key => (
            <div key={key} className='space-y-2'>
              <Skeleton className='h-3 w-20 rounded' />
              <Skeleton className='h-8 w-16 rounded' />
            </div>
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
