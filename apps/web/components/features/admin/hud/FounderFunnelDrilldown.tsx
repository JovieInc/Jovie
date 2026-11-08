'use client';

import { EmptyCell } from '@/components/atoms/EmptyCell';
import { AdminDataTable } from '@/components/features/admin/table/AdminDataTable';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PersonCell } from '@/components/organisms/table/atoms/PersonCell';
import { TableEmptyState } from '@/components/organisms/table/atoms/TableEmptyState';
import { buildAdminGrowthHref } from '@/constants/admin-navigation';
import { APP_ROUTES } from '@/constants/routes';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';

type FounderFunnelStageRow = FounderFunnelStageRows['rows'][number];

function formatSignupDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const columnHelper = createColumnHelper<FounderFunnelStageRow>();

/**
 * The people a funnel stage counted, on the shared table: one PersonCell
 * (name with email as its quiet secondary fact) and the signup date, in the
 * dense 32px row every people table uses.
 */
const FOUNDER_FUNNEL_COLUMNS = [
  columnHelper.display({
    id: 'person',
    header: 'Person',
    size: 360,
    minSize: 240,
    cell: ({ row }) => {
      const { displayName, email } = row.original;
      const name = displayName ?? email;
      if (!name) return <EmptyCell />;
      return (
        <PersonCell
          name={name}
          secondary={displayName && email ? email : undefined}
        />
      );
    },
  }),
  columnHelper.accessor('enteredAt', {
    id: 'enteredAt',
    header: 'Signed Up',
    // The drawer shows at most the first page of a stage, so a client sort
    // would reorder only the loaded subset.
    enableSorting: false,
    size: 140,
    minSize: 120,
    meta: { align: 'right' },
    cell: ({ getValue }) => {
      const value = getValue();
      return value ? (
        <span className='tabular-nums text-secondary-token'>
          {formatSignupDate(value)}
        </span>
      ) : (
        <EmptyCell />
      );
    },
  }),
] as ColumnDef<FounderFunnelStageRow, unknown>[];

function FounderFunnelDrilldownTable({
  rows,
  stageLabel,
}: Readonly<{
  rows: FounderFunnelStageRows['rows'];
  stageLabel: string;
}>) {
  return (
    <AdminDataTable
      data={rows}
      columns={FOUNDER_FUNNEL_COLUMNS}
      rowMode='dense'
      enableVirtualization={false}
      getRowId={row => row.id}
      minWidth='0'
      caption={`${stageLabel} records`}
    />
  );
}

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
          heading='No Records In This Stage'
          description='Nothing in this stage for the selected window.'
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
