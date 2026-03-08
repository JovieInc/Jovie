import { Card, CardContent } from '@jovie/ui';
import { CircleDollarSign, CreditCard, Timer, UserPlus } from 'lucide-react';
import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

interface FunnelMetricsStripProps {
  readonly metrics: AdminFunnelMetrics;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '--';
  return `${(rate * 100).toFixed(1)}%`;
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  });
}

function formatRunway(months: number | null, stripeAvailable: boolean): string {
  if (!stripeAvailable) return '--';
  if (months === null) return 'Infinite';
  if (months === 0) return 'N/A';
  return `${months.toFixed(1)}mo`;
}

interface MetricCardProps {
  readonly title: string;
  readonly value: string;
  readonly subtitle: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconClassName?: string;
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName,
}: MetricCardProps) {
  return (
    <Card className='border-subtle bg-surface-1/90'>
      <CardContent className='space-y-1.5 p-4'>
        <div className='flex items-center gap-1.5'>
          <Icon
            className={`size-3.5 ${iconClassName ?? 'text-tertiary-token'}`}
          />
          <p className='text-2xs tracking-wide text-tertiary-token'>{title}</p>
        </div>
        <p className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
          {value}
        </p>
        <p className='text-app text-secondary-token'>{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export function FunnelMetricsStrip({
  metrics,
}: Readonly<FunnelMetricsStripProps>) {
  const mrrDisplay = metrics.stripeAvailable ? formatUsd(metrics.mrrUsd) : '--';
  const runwayDisplay = formatRunway(
    metrics.runwayMonths,
    metrics.stripeAvailable
  );

  return (
    <div
      className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
      data-testid='funnel-metrics-strip'
    >
      <MetricCard
        title='Signups (7d)'
        value={metrics.signups7d.toLocaleString('en-US')}
        subtitle='All sources'
        icon={UserPlus}
        iconClassName='text-success'
      />

      <MetricCard
        title='Paid Conversions (7d)'
        value={metrics.paidConversions7d.toLocaleString('en-US')}
        subtitle={`${formatPercent(metrics.paidConversionRate)} of signups`}
        icon={CreditCard}
        iconClassName='text-info'
      />

      <MetricCard
        title='MRR'
        value={mrrDisplay}
        subtitle='Monthly recurring revenue'
        icon={CircleDollarSign}
        iconClassName='text-emerald-400'
      />

      <MetricCard
        title='Runway'
        value={runwayDisplay}
        subtitle={mrrDisplay !== '--' ? `at ${mrrDisplay}/mo revenue` : '--'}
        icon={Timer}
        iconClassName='text-warning'
      />
    </div>
  );
}
