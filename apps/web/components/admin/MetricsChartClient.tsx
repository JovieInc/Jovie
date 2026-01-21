'use client';

import dynamic from 'next/dynamic';
import type { AdminUsagePoint } from '@/lib/admin/overview';

interface MetricsChartClientProps {
  points: AdminUsagePoint[];
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
    import('@/components/admin/MetricsChart').then(mod => ({
      default: mod.MetricsChart,
    })),
  {
    loading: () => (
      <div className='space-y-4'>
        <div className='flex items-start justify-between'>
          <div className='space-y-2'>
            <div className='h-4 w-40 animate-pulse rounded bg-surface-1' />
            <div className='h-3 w-24 animate-pulse rounded bg-surface-1' />
          </div>
          <div className='h-4 w-16 animate-pulse rounded bg-surface-1' />
        </div>
        <div className='h-64 animate-pulse rounded-lg bg-surface-1' />
        <div className='grid gap-4 sm:grid-cols-3'>
          {METRICS_CHART_LOADING_CARD_KEYS.map(key => (
            <div key={key} className='space-y-2'>
              <div className='h-3 w-20 animate-pulse rounded bg-surface-1' />
              <div className='h-8 w-16 animate-pulse rounded bg-surface-1' />
            </div>
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export function MetricsChartClient({ points }: MetricsChartClientProps) {
  return <MetricsChartImpl points={points} />;
}
