'use client';

import dynamic from 'next/dynamic';
import { DATA_SERIES } from '@/lib/design/metric-tone';

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

// Funnel stages are ordered data, not status or actions (ASR-041): one
// neutral ramp from quiet to bright, so Paid reads strongest.
const [SCRAPED, CONTACTED, SIGNUPS, PAID] = DATA_SERIES.ordered;

const LEGEND_ITEMS = [
  { key: 'scraped', label: 'Scraped', color: SCRAPED },
  { key: 'contacted', label: 'Contacted', color: CONTACTED },
  { key: 'signups', label: 'Signups', color: SIGNUPS },
  { key: 'paid', label: 'Paid', color: PAID },
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
                stroke={SCRAPED}
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type='monotone'
                dataKey='contacted'
                stroke={CONTACTED}
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type='monotone'
                dataKey='signups'
                stroke={SIGNUPS}
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type='monotone'
                dataKey='paid'
                stroke={PAID}
                strokeWidth={2}
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
