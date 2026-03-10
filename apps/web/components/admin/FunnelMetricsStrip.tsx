import { Card, CardContent } from '@jovie/ui';
import {
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  CreditCard,
  Gauge,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';

interface FunnelMetricsStripProps {
  readonly metrics: AdminFunnelMetrics;
}

function formatPercent(rate: number | null): string {
  if (rate === null) return '—';
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
  if (!stripeAvailable) return '—';
  if (months === null) return 'Infinite';
  if (months === 0) return 'No balance';
  return `${months.toFixed(1)}mo`;
}

function runwaySubtitle(
  months: number | null,
  stripeAvailable: boolean,
  mrrDisplay: string
): string {
  if (!stripeAvailable) return 'Connect Stripe to calculate';
  if (months === null) return 'Revenue covers burn';
  if (months === 0) return 'Add bank balance to calculate';
  return `at ${mrrDisplay}/mo revenue`;
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
    <Card className='border-subtle bg-transparent'>
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

interface PlaceholderMetricCardProps {
  readonly title: string;
  readonly description: string;
}

function PlaceholderMetricCard({
  title,
  description,
}: Readonly<PlaceholderMetricCardProps>) {
  return (
    <Card className='border-subtle bg-transparent'>
      <CardContent className='space-y-2 p-4'>
        <p className='text-2xs tracking-wide text-tertiary-token'>{title}</p>
        <div className='flex items-center justify-between gap-3'>
          <p className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
            —
          </p>
          <Link
            href={APP_ROUTES.SETTINGS_BILLING}
            className='text-app font-medium text-info transition-colors hover:text-info/80'
          >
            Configure
          </Link>
        </div>
        <p className='text-app text-secondary-token'>{description}</p>
      </CardContent>
    </Card>
  );
}

export function FunnelMetricsStrip({
  metrics,
}: Readonly<FunnelMetricsStripProps>) {
  const mrrDisplay = metrics.stripeAvailable ? formatUsd(metrics.mrrUsd) : '—';
  const runwayDisplay = formatRunway(
    metrics.runwayMonths,
    metrics.stripeAvailable
  );

  return (
    <div className='space-y-6' data-testid='funnel-metrics-strip'>
      <section className='space-y-3'>
        <h2 className='text-sm font-semibold text-primary-token'>Core KPIs</h2>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
          <MetricCard
            title='MRR'
            value={mrrDisplay}
            subtitle='Monthly recurring revenue'
            icon={CircleDollarSign}
            iconClassName='text-success'
          />

          <MetricCard
            title='ARR'
            value={metrics.stripeAvailable ? formatUsd(metrics.arrUsd) : '—'}
            subtitle='Annual recurring revenue'
            icon={ChartNoAxesCombined}
            iconClassName='text-info'
          />

          <MetricCard
            title='Runway'
            value={runwayDisplay}
            subtitle={runwaySubtitle(
              metrics.runwayMonths,
              metrics.stripeAvailable,
              mrrDisplay
            )}
            icon={Gauge}
            iconClassName='text-warning'
          />

          <MetricCard
            title='Default-alive date'
            value={metrics.defaultAliveDate ?? '—'}
            subtitle='Date business can sustain with current burn'
            icon={CalendarClock}
            iconClassName='text-tertiary-token'
          />

          <MetricCard
            title='Paying customers'
            value={
              metrics.stripeAvailable
                ? metrics.payingCustomers.toLocaleString('en-US')
                : '—'
            }
            subtitle='Active Stripe subscriptions'
            icon={Users}
            iconClassName='text-accent'
          />

          <MetricCard
            title='Growth rates'
            value={`WoW ${formatPercent(metrics.wowGrowthRate)} · MoM ${formatPercent(metrics.momGrowthRate)}`}
            subtitle='Weekly and monthly revenue momentum'
            icon={TrendingUp}
            iconClassName='text-success'
          />
        </div>
      </section>

      <section className='space-y-3' data-testid='yc-metrics-section'>
        <h2 className='text-sm font-semibold text-primary-token'>YC metrics</h2>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <PlaceholderMetricCard
            title='Churn rate'
            description='Customer churn in the trailing 30 days.'
          />
          <PlaceholderMetricCard
            title='Retention (30/60/90 day)'
            description='Cohort retention windows for active customers.'
          />
          <MetricCard
            title='Engagement proxy'
            value={
              metrics.engagementActiveProfiles30d !== null
                ? metrics.engagementActiveProfiles30d.toLocaleString('en-US')
                : '—'
            }
            subtitle='Profiles with at least one visitor in the last 30 days'
            icon={CreditCard}
            iconClassName='text-info'
          />
          <PlaceholderMetricCard
            title='CAC · LTV · Payback'
            description='Unit economics for sustainable growth.'
          />
        </div>
      </section>
    </div>
  );
}
