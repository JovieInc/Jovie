import { ChevronRight } from 'lucide-react';
import { WeeklyTrendChart } from '@/components/features/admin/WeeklyTrendChart';
import { AnalyticsCard } from '@/components/features/dashboard/atoms/AnalyticsCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { formatPercent, formatUsd } from '@/lib/admin/format';
import {
  getAdminFunnelMetrics,
  getAllTimeFunnelTotals,
  getWeeklyFunnelTrend,
} from '@/lib/admin/funnel-metrics';

function safeConversionRate(
  numerator: number,
  denominator: number
): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

function formatWowGrowth(rate: number | null): {
  label: string;
  className: string;
} {
  if (rate === null) return { label: '—', className: 'text-tertiary-token' };
  if (!Number.isFinite(rate)) return { label: '+∞', className: 'text-success' };
  const pct = (rate * 100).toFixed(1);
  if (rate >= 0) return { label: `+${pct}%`, className: 'text-success' };
  return { label: `${pct}%`, className: 'text-error' };
}

interface FunnelStepProps {
  readonly label: string;
  readonly count: number;
  readonly conversionRate: number | null;
  readonly showArrow: boolean;
}

function FunnelStep({
  label,
  count,
  conversionRate,
  showArrow,
}: FunnelStepProps) {
  return (
    <>
      {showArrow && (
        <ChevronRight
          className='size-3.5 shrink-0 text-tertiary-token'
          aria-hidden='true'
        />
      )}
      <li className='min-w-[100px] shrink-0 list-none'>
        <p className='text-2xs font-semibold text-tertiary-token'>{label}</p>
        <p className='text-[24px] font-[620] leading-none tracking-[-0.028em] text-primary-token tabular-nums'>
          {count.toLocaleString('en-US')}
        </p>
        <p className='mt-0.5 text-xs text-tertiary-token'>
          {conversionRate === null ? '—' : formatPercent(conversionRate)}
        </p>
      </li>
    </>
  );
}

/**
 * Renders the hero metric row (MRR / paying customers / WoW growth) used at
 * the top of the admin Overview. Exported so `/app/admin/page.tsx` can mount
 * it inside `AdminPage`'s `hero` slot.
 */
export async function AdminHeroMetrics() {
  const metrics = await getAdminFunnelMetrics();

  const mrrDisplay = metrics.stripeAvailable ? formatUsd(metrics.mrrUsd) : '—';
  const payingDisplay = metrics.stripeAvailable
    ? metrics.payingCustomers.toLocaleString('en-US')
    : '—';
  const wowGrowth = formatWowGrowth(metrics.wowGrowthRate);

  return (
    <div className='grid grid-cols-3 gap-4' data-testid='admin-hero-metrics'>
      <AnalyticsCard
        variant='hero'
        title='Monthly Recurring Revenue'
        value={mrrDisplay}
        ariaLabel={`Monthly recurring revenue: ${mrrDisplay}`}
      />
      <AnalyticsCard
        variant='hero'
        title='Paying Customers'
        value={payingDisplay}
        ariaLabel={`Paying customers: ${payingDisplay}`}
      />
      <AnalyticsCard
        variant='hero'
        title='WoW Growth'
        value={wowGrowth.label}
        ariaLabel={`Week over week growth: ${wowGrowth.label}`}
      >
        {wowGrowth.label === '—' ? null : (
          <span className={wowGrowth.className}>vs. prior week</span>
        )}
      </AnalyticsCard>
    </div>
  );
}

export function AdminHeroMetricsSkeleton() {
  // Each hero column reserves ~75px so the row matches its resolved height
  // and no layout shift occurs when Suspense resolves (per .claude/rules/ui.md).
  return (
    <div
      className='grid grid-cols-3 gap-4'
      data-testid='admin-hero-metrics-skeleton'
    >
      {['mrr', 'customers', 'growth'].map(key => (
        <div key={key} className='min-h-[75px]'>
          <div className='h-9 w-24 animate-pulse rounded-md bg-surface-1' />
          <div className='mt-1.5 h-4 w-32 animate-pulse rounded-md bg-surface-1' />
        </div>
      ))}
    </div>
  );
}

export async function AdminScoreboardSection() {
  const [metrics, trendData, totals] = await Promise.all([
    getAdminFunnelMetrics(),
    getWeeklyFunnelTrend(4),
    getAllTimeFunnelTotals(),
  ]);

  const isEmpty =
    totals.scraped === 0 &&
    totals.qualified === 0 &&
    metrics.outreachSent7d === 0 &&
    metrics.claimClicks7d === 0 &&
    metrics.signups7d === 0 &&
    metrics.paidConversions7d === 0;

  // Funnel steps — left to right
  const funnelSteps: Array<{
    label: string;
    count: number;
    prevCount: number | null;
  }> = [
    { label: 'Scraped', count: totals.scraped, prevCount: null },
    { label: 'Qualified', count: totals.qualified, prevCount: totals.scraped },
    {
      label: 'Contacted',
      count: metrics.outreachSent7d,
      prevCount: null, // different time window (7d vs all-time) — no meaningful rate
    },
    {
      label: 'Claimed',
      count: metrics.claimClicks7d,
      prevCount: metrics.outreachSent7d,
    },
    {
      label: 'Signed Up',
      count: metrics.signups7d,
      prevCount: metrics.claimClicks7d,
    },
    {
      label: 'Paid',
      count: metrics.paidConversions7d,
      prevCount: metrics.signups7d,
    },
  ];

  return (
    <div className='space-y-4' data-testid='admin-scoreboard'>
      {/* Error state */}
      {metrics.errors.length > 0 && (
        <p className='text-xs text-secondary-token'>
          {metrics.errors.join(' — ')}
        </p>
      )}

      {/* Funnel Pipeline */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='Funnel'
          subtitle='Last 7 days'
          density='compact'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          {isEmpty ? (
            <p className='text-app text-secondary-token'>No funnel data yet</p>
          ) : (
            <ul className='flex items-center gap-3 overflow-x-auto'>
              {funnelSteps.map((step, i) => (
                <FunnelStep
                  key={step.label}
                  label={step.label}
                  count={step.count}
                  conversionRate={
                    step.prevCount === null
                      ? null
                      : safeConversionRate(step.count, step.prevCount)
                  }
                  showArrow={i > 0}
                />
              ))}
            </ul>
          )}
        </div>
      </ContentSurfaceCard>

      {/* Weekly Trend */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='4-Week Trend'
          density='compact'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <WeeklyTrendChart data={trendData} />
          {/* Visually hidden data table for screen readers */}
          <table className='sr-only'>
            <caption>Weekly funnel trend data</caption>
            <thead>
              <tr>
                <th>Week</th>
                <th>Scraped</th>
                <th>Contacted</th>
                <th>Signups</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {trendData.map(week => (
                <tr key={week.weekStart}>
                  <td>{week.weekStart}</td>
                  <td>{week.scraped}</td>
                  <td>{week.contacted}</td>
                  <td>{week.signups}</td>
                  <td>{week.paid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContentSurfaceCard>
    </div>
  );
}

export function AdminScoreboardSectionSkeleton() {
  return (
    <div className='space-y-4' data-testid='admin-scoreboard-skeleton'>
      {/* Funnel skeleton */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-20'
          descriptionWidth='w-24'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='flex gap-3 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          {[
            'scraped',
            'qualified',
            'contacted',
            'claimed',
            'signed-up',
            'paid',
          ].map(key => (
            <div key={key} className='min-w-[100px]'>
              <div className='h-3 w-14 animate-pulse rounded bg-surface-1' />
              <div className='mt-1 h-6 w-12 animate-pulse rounded bg-surface-1' />
              <div className='mt-1 h-3 w-10 animate-pulse rounded bg-surface-1' />
            </div>
          ))}
        </div>
      </ContentSurfaceCard>

      {/* Trend skeleton */}
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeaderSkeleton
          titleWidth='w-28'
          className='min-h-0 px-(--linear-app-header-padding-x) py-3'
        />
        <div className='px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <div className='h-36 animate-pulse rounded-lg bg-surface-1' />
        </div>
      </ContentSurfaceCard>
    </div>
  );
}
