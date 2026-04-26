import {
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  Copy,
  CreditCard,
  ExternalLink,
  Gauge,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { formatPercent, formatUsd } from '@/lib/admin/format';
import type { AdminFunnelMetrics } from '@/lib/admin/types';

interface FunnelMetricsStripProps {
  readonly metrics: AdminFunnelMetrics;
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
    <ContentMetricCard
      label={title}
      value={value}
      subtitle={subtitle}
      icon={Icon}
      iconClassName={iconClassName}
    />
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
    <ContentSurfaceCard className='space-y-2 p-4'>
      <p className='text-2xs font-medium tracking-[0.04em] text-tertiary-token'>
        {title}
      </p>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
          —
        </p>
        <Link
          href={APP_ROUTES.SETTINGS_BILLING}
          className='text-xs font-medium text-primary-token transition-colors hover:text-secondary-token'
        >
          Configure
        </Link>
      </div>
      <p className='text-xs leading-[17px] text-secondary-token'>
        {description}
      </p>
    </ContentSurfaceCard>
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
    <div className='space-y-4' data-testid='funnel-metrics-strip'>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Core KPIs'
          subtitle='Revenue, runway, and monetization health'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-2 xl:grid-cols-3'>
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
      </ContentSurfaceCard>

      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Instagram Activation'
          subtitle='First-week bio-link adoption and activation'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-2 xl:grid-cols-5'>
          <MetricCard
            title='Step Views'
            value={metrics.instagramShareStepViews7d.toLocaleString('en-US')}
            subtitle='Artists who reached the Instagram share step'
            icon={Users}
            iconClassName='text-info'
          />
          <MetricCard
            title='Bio Copies'
            value={metrics.instagramBioCopies7d.toLocaleString('en-US')}
            subtitle='Tagged Instagram bio links copied'
            icon={Copy}
            iconClassName='text-primary-token'
          />
          <MetricCard
            title='Open Rate'
            value={formatPercent(metrics.instagramBioOpenRate7d)}
            subtitle='Share step views that opened Instagram'
            icon={ExternalLink}
            iconClassName='text-accent'
          />
          <MetricCard
            title='Activations'
            value={metrics.instagramBioActivations7d.toLocaleString('en-US')}
            subtitle='First Instagram-sourced visits within seven days'
            icon={TrendingUp}
            iconClassName='text-success'
          />
          <MetricCard
            title='Activation Rate'
            value={formatPercent(metrics.instagramBioActivationRate7d)}
            subtitle='Share step views that activated'
            icon={ChartNoAxesCombined}
            iconClassName='text-success'
          />
        </div>
      </ContentSurfaceCard>

      <ContentSurfaceCard
        className='overflow-hidden p-0'
        data-testid='yc-metrics-section'
      >
        <ContentSectionHeader
          title='YC metrics'
          subtitle='Benchmark gaps and operating signals'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='grid gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y) sm:grid-cols-2 xl:grid-cols-4'>
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
              metrics.engagementActiveProfiles30d === null
                ? '—'
                : metrics.engagementActiveProfiles30d.toLocaleString('en-US')
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
      </ContentSurfaceCard>
    </div>
  );
}
