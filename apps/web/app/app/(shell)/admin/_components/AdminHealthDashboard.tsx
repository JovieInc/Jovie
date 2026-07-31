import {
  Activity,
  ArrowUpRight,
  CircleDollarSign,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { buildAdminPeopleHref } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { formatUsd } from '@/lib/admin/format';
import { getAdminFunnelMetrics } from '@/lib/admin/funnel-metrics';
import { getAdminReliabilitySummary } from '@/lib/admin/overview';
import type { AdminReliabilitySummary } from '@/lib/admin/types';
import { getWaitlistMetrics } from '@/lib/admin/waitlist';

/**
 * JOV-2098 — Overview is a health dashboard only.
 * One signal per primary admin area, each linking to that area's detail screen.
 * Full funnel, outreach, reliability tables, and people tables live elsewhere.
 */

interface HealthAreaTileProps {
  readonly area: string;
  readonly label: string;
  readonly value: string;
  readonly href: string;
  readonly hrefLabel: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly testId: string;
}

function HealthAreaTile({
  area,
  label,
  value,
  href,
  hrefLabel,
  icon: Icon,
  testId,
}: HealthAreaTileProps) {
  return (
    <Link
      href={href}
      className='group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
      data-testid={testId}
      aria-label={`${area}: ${label} ${value}. Open ${hrefLabel}`}
    >
      <ContentSurfaceCard className='flex min-h-28 flex-col justify-between p-4 transition-colors group-hover:border-default'>
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-center gap-1.5'>
            <Icon
              className='size-3.5 shrink-0 text-tertiary-token'
              aria-hidden
            />
            <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
              {area}
            </p>
          </div>
          <ArrowUpRight
            className='size-3.5 shrink-0 text-tertiary-token transition-colors group-hover:text-secondary-token'
            aria-hidden
          />
        </div>
        <div className='mt-3 space-y-1'>
          <p className='text-2xl font-semibold leading-none tracking-[-0.03em] text-primary-token tabular-nums'>
            {value}
          </p>
          <p className='text-xs leading-4 text-secondary-token'>{label}</p>
          <p className='text-2xs text-tertiary-token'>{hrefLabel}</p>
        </div>
      </ContentSurfaceCard>
    </Link>
  );
}

function reliabilityLabel(summary: AdminReliabilitySummary): string {
  if (
    summary.incidents24h >= 5 ||
    summary.errorRatePercent >= 5 ||
    !summary.redisAvailable ||
    summary.deploymentAvailability === 'error' ||
    summary.deploymentState === 'failure'
  ) {
    return 'Critical';
  }

  if (
    summary.incidents24h >= 1 ||
    summary.errorRatePercent >= 1 ||
    summary.unresolvedSentryIssues24h > 0 ||
    summary.deploymentState === 'in_progress'
  ) {
    return 'Needs Attention';
  }

  return 'Healthy';
}

export async function AdminHealthDashboard() {
  const [funnel, reliability, waitlist] = await Promise.all([
    getAdminFunnelMetrics(),
    getAdminReliabilitySummary(),
    getWaitlistMetrics(),
  ]);

  const mrrDisplay = funnel.stripeAvailable ? formatUsd(funnel.mrrUsd) : '—';
  const growthDisplay = funnel.signups7d.toLocaleString('en-US');
  const opsDisplay = reliabilityLabel(reliability);
  const peopleDisplay = waitlist.waitlisted.toLocaleString('en-US');

  return (
    <section
      className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
      data-testid='admin-health-dashboard'
      aria-label='Admin Health By Area'
    >
      <HealthAreaTile
        area='Business'
        label='Monthly Recurring Revenue'
        value={mrrDisplay}
        href={APP_ROUTES.ADMIN_REVENUE_LIFT}
        hrefLabel='Open Revenue Lift'
        icon={CircleDollarSign}
        testId='admin-health-business'
      />
      <HealthAreaTile
        area='Growth'
        label='Weekly Signups'
        value={growthDisplay}
        href={APP_ROUTES.ADMIN_GROWTH}
        hrefLabel='Open Growth'
        icon={TrendingUp}
        testId='admin-health-growth'
      />
      <HealthAreaTile
        area='Ops'
        label='System Reliability'
        value={opsDisplay}
        href={APP_ROUTES.ADMIN_OPS}
        hrefLabel='Open Ops'
        icon={Activity}
        testId='admin-health-ops'
      />
      <HealthAreaTile
        area='People'
        label='Waitlisted'
        value={peopleDisplay}
        href={buildAdminPeopleHref('waitlist')}
        hrefLabel='Open People'
        icon={Users}
        testId='admin-health-people'
      />
    </section>
  );
}

export function AdminHealthDashboardSkeleton() {
  return (
    <section
      className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
      data-testid='admin-health-dashboard-skeleton'
      aria-hidden='true'
    >
      {['business', 'growth', 'ops', 'people'].map(key => (
        <div
          key={key}
          className='min-h-28 rounded-xl border border-subtle bg-surface-1 skeleton'
        />
      ))}
    </section>
  );
}
