import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@jovie/ui';
import { ArrowUpRight } from 'lucide-react';
import type { AdminUsagePoint } from '@/lib/admin/overview';

type ChartPoint = {
  label: string;
  value: number;
};

function buildPolyline(
  points: ChartPoint[],
  max: number,
  range: number
): string {
  if (points.length <= 1) return '';

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * 100;
      const y = ((max - point.value) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');
}

interface MetricsChartProps {
  points: AdminUsagePoint[];
}

export function MetricsChart({ points }: MetricsChartProps) {
  const chartData: ChartPoint[] = points.map(point => ({
    label: point.label,
    value: point.value,
  }));

  if (chartData.length === 0) {
    return (
      <Card className='h-full border-subtle bg-surface-1/80 backdrop-blur-sm'>
        <CardHeader className='flex flex-row items-start justify-between'>
          <div>
            <CardTitle className='text-lg'>Daily active users</CardTitle>
            <CardDescription>Last 14 days</CardDescription>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <p className='text-sm text-secondary-token'>
            No usage data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxValue = Math.max(...chartData.map(point => point.value));
  const valueRange = Math.max(
    maxValue - Math.min(...chartData.map(point => point.value)),
    1
  );

  const polylinePoints = buildPolyline(chartData, maxValue, valueRange);

  const latest = chartData[chartData.length - 1];
  const start = chartData[0];
  const delta = latest.value - start.value;
  const deltaPct = start.value > 0 ? (delta / start.value) * 100 : 0;

  return (
    <Card className='h-full border-subtle bg-surface-1/80 backdrop-blur-sm'>
      <CardHeader className='flex flex-row items-start justify-between'>
        <div>
          <CardTitle className='text-lg'>Daily active users</CardTitle>
          <CardDescription>Last 14 days</CardDescription>
        </div>
        <div className='flex items-center gap-2 rounded-full border border-subtle bg-surface-2 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300'>
          <ArrowUpRight className='size-4' aria-hidden />
          <span>
            {deltaPct >= 0 ? '+' : ''}
            {deltaPct.toFixed(1)}% vs start
          </span>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='relative h-64 w-full overflow-hidden rounded-xl border border-subtle bg-gradient-to-b from-surface-0 via-surface-1 to-surface-2 p-4'>
          <svg
            viewBox='0 0 100 100'
            role='img'
            aria-label='Daily active users over the last 14 days'
            className='h-full w-full text-accent'
            preserveAspectRatio='none'
          >
            <defs>
              <linearGradient id='areaFill' x1='0' x2='0' y1='0' y2='1'>
                <stop offset='0%' stopColor='currentColor' stopOpacity='0.2' />
                <stop
                  offset='100%'
                  stopColor='currentColor'
                  stopOpacity='0.02'
                />
              </linearGradient>
            </defs>
            {[20, 40, 60, 80].map(value => (
              <line
                key={value}
                x1='0'
                x2='100'
                y1={value}
                y2={value}
                stroke='currentColor'
                strokeOpacity='0.08'
                strokeWidth='0.5'
              />
            ))}
            <polyline
              fill='url(#areaFill)'
              stroke='none'
              points={`${polylinePoints} 100,100 0,100`}
            />
            <polyline
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinejoin='round'
              strokeLinecap='round'
              points={polylinePoints}
            />
            {chartData.map((point, index) => {
              const x =
                chartData.length === 1
                  ? 0
                  : (index / (chartData.length - 1)) * 100;
              const y = ((maxValue - point.value) / valueRange) * 100;
              return (
                <circle
                  key={point.label}
                  cx={x}
                  cy={y}
                  r='1.2'
                  fill='currentColor'
                  stroke='currentColor'
                  strokeWidth='0.5'
                />
              );
            })}
          </svg>
          <div className='pointer-events-none absolute inset-4 flex items-end justify-between text-[10px] uppercase tracking-tight text-tertiary-token'>
            {chartData.map(point => (
              <span key={point.label}>{point.label}</span>
            ))}
          </div>
        </div>
        <div className='grid gap-4 text-sm text-secondary-token sm:grid-cols-3'>
          <div className='rounded-lg border border-subtle bg-surface-2 px-4 py-3'>
            <p className='text-xs uppercase tracking-wide text-tertiary-token'>
              Current DAU
            </p>
            <p className='text-lg font-semibold text-primary-token'>
              {latest.value.toLocaleString()}
            </p>
          </div>
          <div className='rounded-lg border border-subtle bg-surface-2 px-4 py-3'>
            <p className='text-xs uppercase tracking-wide text-tertiary-token'>
              14d Average
            </p>
            <p className='text-lg font-semibold text-primary-token'>
              {Math.round(
                chartData.reduce((acc, point) => acc + point.value, 0) /
                  chartData.length
              ).toLocaleString()}
            </p>
          </div>
          <div className='rounded-lg border border-subtle bg-surface-2 px-4 py-3'>
            <p className='text-xs uppercase tracking-wide text-tertiary-token'>
              Peak day
            </p>
            <p className='text-lg font-semibold text-primary-token'>
              {Math.max(
                ...chartData.map(point => point.value)
              ).toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
