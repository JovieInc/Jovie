'use client';

import dynamic from 'next/dynamic';

interface WeeklyTrendChartProps {
  readonly data: Array<{
    weekStart: string;
    scraped: number;
    contacted: number;
    signups: number;
    paid: number;
  }>;
}

export function formatWeekLabel(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const LEGEND_ITEMS = [
  { key: 'scraped', label: 'Scraped', color: 'var(--linear-text-tertiary)' },
  { key: 'contacted', label: 'Contacted', color: 'hsl(var(--color-info))' },
  { key: 'signups', label: 'Signups', color: 'hsl(var(--color-accent))' },
  { key: 'paid', label: 'Paid', color: 'hsl(var(--color-success))' },
] as const;

const LazyTrendChart = dynamic(
  () =>
    import('recharts').then(mod => {
      const { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis } =
        mod;

      function RechartsTrendChart({
        data,
      }: {
        readonly data: WeeklyTrendChartProps['data'];
      }) {
        const formatted = data.map(d => ({
          ...d,
          label: formatWeekLabel(d.weekStart),
        }));

        return (
          <ResponsiveContainer width='100%' height={144}>
            <LineChart
              data={formatted}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray='3 3'
                vertical={false}
                stroke='var(--linear-border-subtle)'
                opacity={0.15}
              />
              <XAxis
                dataKey='label'
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--linear-text-tertiary)' }}
              />
              <Line
                type='monotone'
                dataKey='scraped'
                stroke='var(--linear-text-tertiary)'
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type='monotone'
                dataKey='contacted'
                stroke='hsl(var(--color-info))'
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type='monotone'
                dataKey='signups'
                stroke='hsl(var(--color-accent))'
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type='monotone'
                dataKey='paid'
                stroke='hsl(var(--color-success))'
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      }

      return RechartsTrendChart;
    }),
  {
    ssr: false,
    loading: () => (
      <div className='h-36 animate-pulse rounded-lg bg-surface-1' />
    ),
  }
);

export function WeeklyTrendChart({ data }: Readonly<WeeklyTrendChartProps>) {
  return (
    <div data-testid='weekly-trend-chart'>
      <div className='h-36'>
        <LazyTrendChart data={data} />
      </div>
      <div className='mt-2 flex justify-end gap-4'>
        {LEGEND_ITEMS.map(item => (
          <div key={item.key} className='flex items-center gap-1.5'>
            <div
              className='h-2 w-2 rounded-full'
              style={{ backgroundColor: item.color }}
            />
            <span className='text-2xs text-tertiary-token'>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
