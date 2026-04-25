import { ChevronRight } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getLeadFunnelReport } from '@/lib/leads/reporting';
import type { LeadFunnelCounts } from './LeadPipelineKpis';

export type { LeadFunnelCounts } from './LeadPipelineKpis';

function FunnelStage({
  label,
  count,
  rate,
  isLast,
}: Readonly<{
  label: string;
  count: number;
  rate?: string;
  isLast?: boolean;
}>) {
  return (
    <div className='flex items-center gap-1.5'>
      <div className='flex flex-col'>
        <span className='text-app font-book text-secondary-token'>{label}</span>
        <span className='text-[20px] font-medium tabular-nums text-primary-token'>
          {count.toLocaleString()}
        </span>
        {rate && (
          <span className='text-2xs font-book text-tertiary-token'>{rate}</span>
        )}
      </div>
      {!isLast && (
        <ChevronRight className='mx-1 h-4 w-4 shrink-0 text-tertiary-token' />
      )}
    </div>
  );
}

function DropOff({
  label,
  count,
  total,
}: Readonly<{ label: string; count: number; total: number }>) {
  if (count === 0) return null;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <span className='text-2xs font-book text-destructive/70'>
      {count.toLocaleString()} {label} ({pct}%)
    </span>
  );
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator === 0) return '--';
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function EmptyFunnel() {
  return (
    <ContentSurfaceCard
      className='px-(--linear-app-content-padding-x) py-6'
      data-testid='gtm-pipeline-status'
    >
      <p className='text-center text-app font-book text-secondary-token'>
        Pipeline hasn&apos;t run yet. Select a speed above to start.
      </p>
    </ContentSurfaceCard>
  );
}

export function GtmFunnelSkeleton() {
  return (
    <ContentSurfaceCard className='px-(--linear-app-content-padding-x) py-4'>
      <div className='flex gap-6'>
        {['sk-discovered', 'sk-qualified', 'sk-approved', 'sk-ingested'].map(
          id => (
            <div key={id} className='space-y-1'>
              <div className='h-3 w-16 animate-pulse rounded bg-surface-0' />
              <div className='h-6 w-10 animate-pulse rounded bg-surface-0' />
            </div>
          )
        )}
      </div>
      <div className='mt-3 h-3 w-56 animate-pulse rounded bg-surface-0' />
    </ContentSurfaceCard>
  );
}

interface GtmFunnelProps {
  readonly counts: LeadFunnelCounts;
}

export async function GtmFunnel({ counts }: GtmFunnelProps) {
  const report = await getLeadFunnelReport();

  const discovered = counts.discovered ?? 0;
  const qualified = counts.qualified ?? 0;
  const disqualified = counts.disqualified ?? 0;
  const approved = counts.approved ?? 0;
  const ingested = counts.ingested ?? 0;
  const rejected = counts.rejected ?? 0;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  if (total === 0) return <EmptyFunnel />;

  const { summary } = report;

  return (
    <ContentSurfaceCard
      className='overflow-hidden px-(--linear-app-content-padding-x) py-4'
      data-testid='gtm-pipeline-status'
    >
      {/* Pipeline status (all time) */}
      <p className='mb-2 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary-token'>
        Pipeline status
      </p>
      <div className='flex flex-wrap items-start gap-x-1 gap-y-3'>
        <FunnelStage label='Discovered' count={discovered} />
        <FunnelStage
          label='Qualified'
          count={qualified}
          rate={discovered > 0 ? formatRate(qualified, discovered) : undefined}
        />
        <FunnelStage label='Approved' count={approved} />
        <FunnelStage label='Ingested' count={ingested} isLast />
      </div>
      <div className='mt-1.5 flex flex-wrap gap-4'>
        <DropOff label='disqualified' count={disqualified} total={discovered} />
        <DropOff
          label='rejected'
          count={rejected}
          total={approved + rejected}
        />
      </div>

      {/* Conversion (last 30 days) */}
      {summary.contacted > 0 && (
        <div className='mt-4 border-t border-subtle pt-3'>
          <p className='mb-1 text-2xs font-medium uppercase tracking-[0.08em] text-tertiary-token'>
            Conversion (last 30 days)
          </p>
          <p className='text-app font-book text-secondary-token'>
            Contacted: {summary.contacted}
            {' · '}
            Claimed: {summary.claimClicks} (
            {formatRate(summary.claimClicks, summary.contacted)}){' · '}
            Signed up: {summary.signups}
            {summary.paidConversions > 0 && (
              <>
                {' · '}
                Paid: {summary.paidConversions}
              </>
            )}
          </p>
        </div>
      )}
    </ContentSurfaceCard>
  );
}
