import type { Metadata } from 'next';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';
import { getAdminBraggingRights } from '@/lib/admin/bragging-rights';
import {
  getAdminFunnelMetrics,
  getAllTimeFunnelTotals,
  getWeeklyFunnelTrend,
} from '@/lib/admin/funnel-metrics';
import { getAdminOverviewMetrics } from '@/lib/admin/overview';

export const metadata: Metadata = {
  title: 'YC Command Center',
};

export const runtime = 'nodejs';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  let formatted = '$0';

  if (abs >= 1000) {
    formatted = `$${(abs / 1000).toFixed(1)}K`;
  } else if (abs >= 1) {
    formatted = `$${abs.toFixed(0)}`;
  } else if (abs > 0) {
    formatted = `$${abs.toFixed(2)}`;
  }

  return n < 0 ? `-${formatted}` : formatted;
}

function fmtPct(n: number | null): string {
  if (n == null) return '—';
  if (!Number.isFinite(n)) return '+∞';
  return `${(n * 100).toFixed(1)}%`;
}

function formatMomGrowth(rate: number | null): string {
  if (rate == null) return 'No prior month';
  const sign = rate >= 0 ? '+' : '';
  return `${sign}${(rate * 100).toFixed(0)}% 30d`;
}

function fmtRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function FunnelBar({
  label,
  count,
  maxCount,
  rate,
}: {
  readonly label: string;
  readonly count: number;
  readonly maxCount: number;
  readonly rate?: string;
}) {
  const width =
    maxCount > 0 ? Math.min(100, Math.max(2, (count / maxCount) * 100)) : 0;
  return (
    <div className='flex items-center gap-3'>
      <span className='w-20 shrink-0 text-[12px] font-[560] text-secondary-token'>
        {label}
      </span>
      <div className='flex-1'>
        <div
          className='h-5 rounded-sm bg-accent-token/20'
          style={{ width: `${width}%`, minWidth: count > 0 ? '4px' : '0' }}
        />
      </div>
      <span className='w-16 shrink-0 text-right text-[13px] font-[610] tabular-nums text-primary-token'>
        {fmt(count)}
      </span>
      {rate != null ? (
        <span className='w-14 shrink-0 text-right text-[11px] tabular-nums text-tertiary-token'>
          {rate}
        </span>
      ) : (
        <span className='w-14 shrink-0' />
      )}
    </div>
  );
}

function WeeklyTrendTable({
  weeks,
}: {
  readonly weeks: ReadonlyArray<{
    readonly weekStart: string;
    readonly scraped: number;
    readonly qualified: number;
    readonly contacted: number;
    readonly signups: number;
    readonly paid: number;
  }>;
}) {
  if (weeks.length === 0) {
    return (
      <p className='text-[12px] text-tertiary-token py-4 text-center'>
        No weekly data yet. Turn on the pipeline to start tracking.
      </p>
    );
  }

  // Calculate WoW trend for each column
  const lastTwo = weeks.slice(-2);
  const trend = (
    key: 'scraped' | 'qualified' | 'contacted' | 'signups' | 'paid'
  ) => {
    if (lastTwo.length < 2) return '—';
    const prev = lastTwo[0][key];
    const curr = lastTwo[1][key];
    if (prev === 0) return curr > 0 ? '+∞' : '—';
    const pct = (((curr - prev) / prev) * 100).toFixed(0);
    return Number(pct) >= 0 ? `+${pct}%` : `${pct}%`;
  };

  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-[12px]'>
        <thead>
          <tr className='text-tertiary-token font-[560]'>
            <th className='text-left py-1.5 pr-4'>Week</th>
            <th className='text-right py-1.5 px-2'>Scraped</th>
            <th className='text-right py-1.5 px-2'>Qualified</th>
            <th className='text-right py-1.5 px-2'>Contacted</th>
            <th className='text-right py-1.5 px-2'>Signups</th>
            <th className='text-right py-1.5 pl-2'>Paid</th>
          </tr>
        </thead>
        <tbody className='tabular-nums'>
          {weeks.map(week => (
            <tr
              key={week.weekStart}
              className='border-t border-separator-token'
            >
              <td className='py-1.5 pr-4 text-secondary-token'>
                {new Date(`${week.weekStart}T00:00:00Z`).toLocaleDateString(
                  'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  }
                )}
              </td>
              <td className='text-right py-1.5 px-2'>{fmt(week.scraped)}</td>
              <td className='text-right py-1.5 px-2'>{fmt(week.qualified)}</td>
              <td className='text-right py-1.5 px-2'>{fmt(week.contacted)}</td>
              <td className='text-right py-1.5 px-2'>{fmt(week.signups)}</td>
              <td className='text-right py-1.5 pl-2'>{fmt(week.paid)}</td>
            </tr>
          ))}
          <tr className='border-t border-separator-token font-[610]'>
            <td className='py-1.5 pr-4 text-tertiary-token'>Trend</td>
            <td className='text-right py-1.5 px-2'>{trend('scraped')}</td>
            <td className='text-right py-1.5 px-2'>{trend('qualified')}</td>
            <td className='text-right py-1.5 px-2'>{trend('contacted')}</td>
            <td className='text-right py-1.5 px-2'>{trend('signups')}</td>
            <td className='text-right py-1.5 pl-2'>{trend('paid')}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default async function YcMetricsPage() {
  const [funnel, overview, bragging, allTimeTotals, weeklyTrend] =
    await Promise.all([
      getAdminFunnelMetrics(),
      getAdminOverviewMetrics(),
      getAdminBraggingRights(),
      getAllTimeFunnelTotals(),
      getWeeklyFunnelTrend(4),
    ]);

  const maxFunnel = Math.max(
    1,
    allTimeTotals.scraped,
    allTimeTotals.qualified,
    allTimeTotals.contacted,
    allTimeTotals.claimed,
    allTimeTotals.signedUp,
    allTimeTotals.paid
  );

  return (
    <PageShell>
      <PageContent noPadding>
        <div className='space-y-6 px-3 py-2'>
          {/* Header */}
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeader
              title='YC Command Center'
              subtitle={`Last updated ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              className='min-h-0 px-app-header py-3'
            />
          </ContentSurfaceCard>

          {/* Section 1: Traction */}
          <div>
            <h2 className='text-[12px] font-[610] uppercase tracking-[0.08em] text-tertiary-token mb-2'>
              Traction
            </h2>
            <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
              <ContentMetricCard
                label='MRR'
                value={fmtUsd(funnel.mrrUsd)}
                subtitle={formatMomGrowth(funnel.momGrowthRate)}
              />
              <ContentMetricCard
                label='Claimed Creators'
                value={fmt(overview.claimedCreators)}
                subtitle='Active on platform'
              />
              <ContentMetricCard
                label='Signups (7d)'
                value={fmt(funnel.signups7d)}
                subtitle='From GTM pipeline'
              />
              <ContentMetricCard
                label='WoW Growth'
                value={fmtPct(funnel.wowGrowthRate)}
                subtitle='Signup growth rate'
              />
            </div>
          </div>

          {/* Section 2: Acquisition Funnel */}
          <div>
            <h2 className='text-[12px] font-[610] uppercase tracking-[0.08em] text-tertiary-token mb-2'>
              Acquisition Funnel
            </h2>
            <ContentSurfaceCard className='p-4 space-y-2'>
              <FunnelBar
                label='Scraped'
                count={allTimeTotals.scraped}
                maxCount={maxFunnel}
              />
              <FunnelBar
                label='Qualified'
                count={allTimeTotals.qualified}
                maxCount={maxFunnel}
                rate={fmtRate(allTimeTotals.qualified, allTimeTotals.scraped)}
              />
              <FunnelBar
                label='Contacted'
                count={allTimeTotals.contacted}
                maxCount={maxFunnel}
                rate={fmtRate(allTimeTotals.contacted, allTimeTotals.qualified)}
              />
              <FunnelBar
                label='Claimed'
                count={allTimeTotals.claimed}
                maxCount={maxFunnel}
                rate={fmtRate(allTimeTotals.claimed, allTimeTotals.contacted)}
              />
              <FunnelBar
                label='Signed Up'
                count={allTimeTotals.signedUp}
                maxCount={maxFunnel}
                rate={fmtRate(allTimeTotals.signedUp, allTimeTotals.claimed)}
              />
              <FunnelBar
                label='Paid'
                count={allTimeTotals.paid}
                maxCount={maxFunnel}
                rate={fmtRate(allTimeTotals.paid, allTimeTotals.signedUp)}
              />
            </ContentSurfaceCard>
          </div>

          {/* Section 3: Unit Economics */}
          <div>
            <h2 className='text-[12px] font-[610] uppercase tracking-[0.08em] text-tertiary-token mb-2'>
              Unit Economics
            </h2>
            <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
              <ContentMetricCard
                label='CAC'
                value={funnel.cacUsd != null ? fmtUsd(funnel.cacUsd) : '—'}
                subtitle='Cost per signup'
              />
              <ContentMetricCard
                label='LTV'
                value={funnel.ltvUsd != null ? fmtUsd(funnel.ltvUsd) : '—'}
                subtitle='12-mo estimated'
              />
              <ContentMetricCard
                label='LTV / CAC'
                value={
                  funnel.ltvUsd != null &&
                  funnel.cacUsd != null &&
                  funnel.cacUsd > 0
                    ? `${(funnel.ltvUsd / funnel.cacUsd).toFixed(1)}x`
                    : '—'
                }
                subtitle='Target: > 3x'
              />
              <ContentMetricCard
                label='Payback'
                value={
                  funnel.paybackPeriodMonths != null
                    ? `${funnel.paybackPeriodMonths.toFixed(1)} mo`
                    : '—'
                }
                subtitle='Months to recover CAC'
              />
            </div>
          </div>

          {/* Section 4: Engagement */}
          <div>
            <h2 className='text-[12px] font-[610] uppercase tracking-[0.08em] text-tertiary-token mb-2'>
              Engagement
            </h2>
            <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
              <ContentMetricCard
                label='DSP Clicks'
                value={fmt(bragging.totalDspClicks)}
                subtitle='Listen link clicks driven'
              />
              <ContentMetricCard
                label='Profile Views'
                value={fmt(bragging.totalProfileViews)}
                subtitle='All time'
              />
              <ContentMetricCard
                label='Contacts Captured'
                value={fmt(bragging.totalContactsCaptured)}
                subtitle='Email + SMS subscribers'
              />
              <ContentMetricCard
                label='Magic Moment'
                value={fmtPct(funnel.magicMomentRate)}
                subtitle={`${funnel.magicMomentCount} complete profiles`}
              />
            </div>
          </div>

          {/* Section 5: Financial Health */}
          <div>
            <h2 className='text-[12px] font-[610] uppercase tracking-[0.08em] text-tertiary-token mb-2'>
              Financial Health
            </h2>
            <div className='grid grid-cols-2 gap-2 md:grid-cols-4'>
              <ContentMetricCard
                label='Bank Balance'
                value={fmtUsd(overview.balanceUsd)}
                subtitle='Mercury'
              />
              <ContentMetricCard
                label='Monthly Burn'
                value={fmtUsd(overview.burnRateUsd)}
                subtitle='Net of MRR'
              />
              <ContentMetricCard
                label='Runway'
                value={
                  overview.runwayMonths != null
                    ? `${overview.runwayMonths.toFixed(1)} mo`
                    : '—'
                }
                subtitle='At current burn'
              />
              <ContentMetricCard
                label='Default Status'
                value={overview.defaultStatus === 'alive' ? 'Alive' : 'Dead'}
                subtitle={overview.defaultStatusDetail}
                valueClassName={
                  overview.defaultStatus === 'alive'
                    ? 'text-success-token'
                    : 'text-error-token'
                }
              />
            </div>
          </div>

          {/* Section 6: Weekly Trend */}
          <div>
            <h2 className='text-[12px] font-[610] uppercase tracking-[0.08em] text-tertiary-token mb-2'>
              Weekly Trend
            </h2>
            <ContentSurfaceCard className='p-4'>
              <WeeklyTrendTable weeks={weeklyTrend} />
            </ContentSurfaceCard>
          </div>
        </div>
      </PageContent>
    </PageShell>
  );
}
