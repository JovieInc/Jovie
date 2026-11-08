import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TableEmptyState } from '@/components/organisms/table/atoms/TableEmptyState';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { FounderFunnelDrilldownTable } from './FounderFunnelDrilldownTable';

interface FounderFunnelDrilldownProps {
  readonly result: FounderFunnelStageRows;
  readonly urlSearchParams?: string;
}

const RANGE_LABELS = {
  '7d': 'last 7 days',
  '30d': 'last 30 days',
  all: 'all time',
} as const;

/**
 * Founder funnel stage drill-down (JOV-7484): lists exactly the records the
 * stage aggregate counted — same cohort window, identity rules, and
 * internal/test exclusions. Deep-linked via ?funnelStage&?funnelRange.
 */
export function FounderFunnelDrilldown({
  result,
  urlSearchParams,
}: Readonly<FounderFunnelDrilldownProps>) {
  const params = new URLSearchParams(urlSearchParams);
  params.delete('funnelStage');
  const backHref =
    urlSearchParams === undefined
      ? buildAdminGrowthHref('leads')
      : `${APP_ROUTES.ADMIN_GROWTH}?${params.toString()}`;

  return (
    <ContentSurfaceCard data-testid='founder-funnel-drilldown'>
      <div className='flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3'>
        <div>
          <h2 className='text-sm font-semibold tracking-tight text-primary-token'>
            {result.stageLabel} · {result.total.toLocaleString('en-US')}{' '}
            {result.total === 1 ? 'person' : 'people'}
          </h2>
          <p className='mt-0.5 text-xs text-secondary-token'>
            {result.stageDescription} — {RANGE_LABELS[result.timeRange]} cohort.
          </p>
        </div>
        <a
          href={backHref}
          className='text-xs text-secondary-token underline-offset-2 hover:text-primary-token hover:underline'
        >
          Clear drill-down
        </a>
      </div>
      {result.errors.length > 0 ? (
        <p className='px-3 py-2 text-xs text-error'>
          {result.errors.join('; ')}
        </p>
      ) : result.rows.length === 0 ? (
        <TableEmptyState
          testId='founder-funnel-drilldown-empty'
          heading='No records in this stage for the selected window.'
        />
      ) : (
        <div className='overflow-x-auto pb-3 pt-2'>
          <FounderFunnelDrilldownTable
            rows={result.rows}
            stageLabel={result.stageLabel}
          />
          {result.total > result.rows.length ? (
            <p className='px-3 pt-2 text-2xs text-tertiary-token'>
              Showing first {result.rows.length.toLocaleString('en-US')} of{' '}
              {result.total.toLocaleString('en-US')} records.
            </p>
          ) : null}
        </div>
      )}
    </ContentSurfaceCard>
  );
}
