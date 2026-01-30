'use client';

import { TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import type { AdminUsagePoint } from '@/lib/admin/overview';

interface MetricsChartProps {
  readonly points: AdminUsagePoint[];
}

export function MetricsChart({ points }: Readonly<MetricsChartProps>) {
  const chartData = points.map(point => ({
    date: point.label,
    users: point.value,
  }));

  if (chartData.length === 0) {
    return (
      <div className='space-y-3'>
        <div>
          <h3 className='text-sm font-medium text-primary-token'>
            Daily active users
          </h3>
          <p className='text-xs text-tertiary-token'>Last 14 days</p>
        </div>
        <p className='text-sm text-secondary-token'>
          No usage data available yet.
        </p>
      </div>
    );
  }

  const latest = chartData.at(-1)!;
  const start = chartData[0];
  const delta = latest.users - start.users;
  const deltaPct = start.users > 0 ? (delta / start.users) * 100 : 0;
  const avgUsers = Math.round(
    chartData.reduce((acc, point) => acc + point.users, 0) / chartData.length
  );
  const maxUsers = Math.max(...chartData.map(point => point.users));

  return (
    <div className='space-y-4'>
      <div className='flex items-start justify-between'>
        <div>
          <h3 className='text-sm font-medium text-primary-token'>
            Daily active users
          </h3>
          <p className='text-xs text-tertiary-token'>Last 14 days</p>
        </div>
        <div className='flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400'>
          <TrendingUp className='h-3.5 w-3.5' />
          {deltaPct >= 0 ? '+' : ''}
          {deltaPct.toFixed(1)}%
        </div>
      </div>

      <div className='h-64'>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          width={800}
          height={256}
        >
          <CartesianGrid
            strokeDasharray='3 3'
            vertical={false}
            stroke='hsl(var(--color-border-subtle))'
            opacity={0.3}
          />
          <XAxis
            dataKey='date'
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--color-text-tertiary))' }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: 'hsl(var(--color-text-tertiary))' }}
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
      </div>

      <div className='grid gap-4 sm:grid-cols-3'>
        <div>
          <p className='text-xs text-tertiary-token'>Current DAU</p>
          <p className='text-2xl font-semibold tabular-nums text-primary-token'>
            {latest.users.toLocaleString()}
          </p>
        </div>
        <div>
          <p className='text-xs text-tertiary-token'>14d Average</p>
          <p className='text-2xl font-semibold tabular-nums text-primary-token'>
            {avgUsers.toLocaleString()}
          </p>
        </div>
        <div>
          <p className='text-xs text-tertiary-token'>Peak day</p>
          <p className='text-2xl font-semibold tabular-nums text-primary-token'>
            {maxUsers.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
