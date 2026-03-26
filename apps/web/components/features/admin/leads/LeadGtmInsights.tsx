import { BarChart2, Link2, Mail, Sparkles, TrendingUp } from 'lucide-react';
import { KpiItem } from '@/components/features/admin/KpiItem';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getLeadFunnelReport } from '@/lib/leads/reporting';

function formatRate(value: number | null): string {
  if (value === null) return '--';
  return `${(value * 100).toFixed(1)}%`;
}

function BreakdownList({
  title,
  rows,
}: Readonly<{
  title: string;
  rows: {
    cohort: string;
    paidConversions: number;
    signups: number;
    scraped: number;
  }[];
}>) {
  return (
    <div className='rounded-lg border border-subtle bg-surface-0 p-3'>
      <p className='mb-2 text-xs font-medium uppercase tracking-[0.08em] text-tertiary-token'>
        {title}
      </p>
      <div className='space-y-2'>
        {rows.length === 0 ? (
          <p className='text-xs text-secondary-token'>
            No attributable data yet.
          </p>
        ) : (
          rows.map(row => (
            <div
              key={row.cohort}
              className='flex items-center justify-between gap-3 text-sm'
            >
              <span className='truncate text-primary-token'>{row.cohort}</span>
              <span className='shrink-0 tabular-nums text-secondary-token'>
                {row.paidConversions} paid / {row.signups} signups /{' '}
                {row.scraped} scraped
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export async function LeadGtmInsights() {
  const report = await getLeadFunnelReport();
  const claimRate =
    report.summary.contacted > 0
      ? report.summary.claimClicks / report.summary.contacted
      : null;
  const signupRate =
    report.summary.claimClicks > 0
      ? report.summary.signups / report.summary.claimClicks
      : null;
  const paidRate =
    report.summary.signups > 0
      ? report.summary.paidConversions / report.summary.signups
      : null;

  return (
    <section>
      <ContentSurfaceCard className='overflow-hidden p-0'>
        <ContentSectionHeader
          title='GTM insights'
          subtitle='Attributed cohort performance and ramp recommendation'
          className='px-(--linear-app-header-padding-x) py-3'
        />
        <div className='space-y-4 px-(--linear-app-content-padding-x) py-(--linear-app-content-padding-y)'>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
            <KpiItem
              title='SCRAPED'
              value={String(report.summary.scraped)}
              metadata={<span>Leads in the current cohort window</span>}
              icon={Sparkles}
            />
            <KpiItem
              title='CONTACTED'
              value={String(report.summary.contacted)}
              metadata={<span>Email queued or DM sent</span>}
              icon={Mail}
            />
            <KpiItem
              title='CLAIM RATE'
              value={formatRate(claimRate)}
              metadata={<span>Claim page views / contacted</span>}
              icon={Link2}
            />
            <KpiItem
              title='SIGNUP RATE'
              value={formatRate(signupRate)}
              metadata={<span>Signups / claim page views</span>}
              icon={TrendingUp}
            />
            <KpiItem
              title='PAID RATE'
              value={formatRate(paidRate)}
              metadata={<span>Paid conversions / signups</span>}
              icon={BarChart2}
            />
          </div>

          <div className='rounded-lg border border-subtle bg-surface-0 p-3'>
            <p className='text-xs font-medium uppercase tracking-[0.08em] text-tertiary-token'>
              Ramp recommendation
            </p>
            <div className='mt-2 flex flex-wrap items-center gap-3'>
              <span className='text-lg font-semibold text-primary-token'>
                {report.rampRecommendation.recommendedAction.toUpperCase()}
              </span>
              <span className='text-sm text-secondary-token'>
                Next daily cap:{' '}
                {report.rampRecommendation.recommendedNextDailyCap}
              </span>
              <span className='text-sm text-secondary-token'>
                Sample: {report.rampRecommendation.sampleSize}
              </span>
            </div>
            <p className='mt-2 text-sm text-secondary-token'>
              {report.rampRecommendation.reasons.join(' ')}
            </p>
          </div>

          <div className='grid gap-3 xl:grid-cols-3'>
            <BreakdownList
              title='Top music tools'
              rows={report.musicToolBreakdown}
            />
            <BreakdownList
              title='Source platforms'
              rows={report.sourceBreakdown}
            />
            <BreakdownList title='Pixel cohorts' rows={report.pixelBreakdown} />
          </div>
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
