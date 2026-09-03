'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import {
  ContentChartSkeleton,
  ContentChartState,
} from '@/components/molecules/ContentChartState';
import { ContentMetricDelta } from '@/components/molecules/ContentMetricDelta';
import { ContentMetricStat } from '@/components/molecules/ContentMetricStat';
import type { AdminUsagePoint } from '@/lib/admin/types';

const LazyLineChart = dynamic(
  () =>
    import('recharts').then(mod => {
      const { CartesianGrid, Line, LineChart, XAxis, YAxis } = mod;

      function RechartsLineChart({
        data,
      }: {
        readonly data: { date: string; users: number }[];
      }) {
        return (
          <LineChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            width={800}
            height={256}
          >
            <CartesianGrid
              strokeDasharray='3 3'
              vertical={false}
              stroke='var(--linear-border-subtle)'
              opacity={0.3}
            />
            <XAxis
              dataKey='date'
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--linear-text-tertiary)' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--linear-text-tertiary)' }}
            />
            <Line
              type='monotone'
              dataKey='users'
              stroke='hsl(var(--color-accent))'
              strokeWidth={2}
              dot={{
                fill: 'hsl(var(--color-accent))',
                r: 3,
                strokeWidth: 0,
              }}
              activeDot={{
                r: 5,
                fill: 'hsl(var(--color-accent))',
                strokeWidth: 0,
              }}
            />
          </LineChart>
        );
      }

      return RechartsLineChart;
    }),
  {
    ssr: false,
    loading: () => (
      <ContentChartSkeleton
        label='Loading Daily Active Users Chart'
        testId='admin-usage-chart-loading'
      />
    ),
  }
);

interface MetricsChartProps {
  readonly points: AdminUsagePoint[];
}

export function MetricsChart({ points }: Readonly<MetricsChartProps>) {
  const chartData = useMemo(
    () =>
      points.map(point => ({
        date: point.label,
        users: point.value,
      })),
    [points]
  );

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    const latest = chartData[chartData.length - 1];
    if (!latest) return null;
    const start = chartData[0];
    const delta = latest.users - start.users;
    const deltaPct = start.users > 0 ? (delta / start.users) * 100 : 0;
    const avgUsers = Math.round(
      chartData.reduce((acc, point) => acc + point.users, 0) / chartData.length
    );
    const maxUsers = Math.max(...chartData.map(point => point.users));
    return { latest, deltaPct, avgUsers, maxUsers };
  }, [chartData]);

  if (!stats) {
    return (
      <div className='space-y-3'>
        <MetricsChartHeader />
        <ContentChartState
          state='empty'
          title='No usage data'
          message='No usage data available yet.'
          testId='admin-usage-chart-empty'
        />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-start justify-between'>
        <MetricsChartHeader />
        <ContentMetricDelta
          direction={
            stats.deltaPct > 0 ? 'up' : stats.deltaPct < 0 ? 'down' : 'flat'
          }
          value={`${stats.deltaPct >= 0 ? '+' : ''}${stats.deltaPct.toFixed(1)}%`}
          aria-label={`Daily active users changed by ${stats.deltaPct.toFixed(1)}%`}
        />
      </div>

      <div className='h-64'>
        <LazyLineChart data={chartData} />
      </div>

      <div className='grid gap-4 sm:grid-cols-3'>
        <ContentMetricStat
          label='Current DAU'
          value={stats.latest.users.toLocaleString()}
          valueClassName='text-2xl'
        />
        <ContentMetricStat
          label='14d Average'
          value={stats.avgUsers.toLocaleString()}
          valueClassName='text-2xl'
        />
        <ContentMetricStat
          label='Peak day'
          value={stats.maxUsers.toLocaleString()}
          valueClassName='text-2xl'
        />
      </div>
    </div>
  );
}

function MetricsChartHeader() {
  return (
    <div>
      <h3 className='text-sm font-medium text-primary-token'>
        Daily active users
      </h3>
      <p className='text-2xs text-tertiary-token'>Last 14 days</p>
    </div>
  );
}
