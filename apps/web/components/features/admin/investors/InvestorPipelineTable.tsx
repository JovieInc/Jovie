'use client';

import { Badge, IconButton } from '@jovie/ui';
import {
  Check,
  CheckCircle2,
  CircleSlash,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import type { CellContext, ColumnDef } from '@/lib/tanstack-table';
import { createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

export interface InvestorPipelineRow {
  readonly id: string;
  readonly token: string;
  readonly label: string;
  readonly investorName: string;
  readonly stage: string;
  readonly engagementScore: number;
  readonly viewCount: number;
  readonly lastViewedLabel: string;
  readonly isActive: boolean;
}

interface InvestorPipelineTableProps {
  readonly rows: InvestorPipelineRow[];
  readonly isLoading?: boolean;
}

const INVESTOR_TABLE_MIN_WIDTH = '760px';

const INVESTOR_TABLE_SKELETON_COLUMN_CONFIG = [
  { variant: 'release' as const, width: '100%' },
  { variant: 'text' as const, width: '100%' },
  { variant: 'badge' as const, width: '72px' },
  { variant: 'text' as const, width: '40px' },
  { variant: 'text' as const, width: '40px' },
  { variant: 'meta' as const, width: '100%' },
  { variant: 'badge' as const, width: '72px' },
];

const STAGE_STYLES: Record<
  string,
  {
    readonly label: string;
    readonly variant:
      | 'default'
      | 'secondary'
      | 'warning'
      | 'success'
      | 'destructive';
  }
> = {
  committed: { label: 'Committed', variant: 'success' },
  declined: { label: 'Declined', variant: 'destructive' },
  engaged: { label: 'Engaged', variant: 'warning' },
  meeting_booked: { label: 'Meeting Booked', variant: 'default' },
  passed: { label: 'Passed', variant: 'destructive' },
  shared: { label: 'Shared', variant: 'secondary' },
  viewed: { label: 'Viewed', variant: 'default' },
  wired: { label: 'Wired', variant: 'success' },
};

export function InvestorTokenCopyButton({
  token,
}: Readonly<{ token: string }>) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const visibleToken = isRevealed ? token : `${token.slice(0, 8)}...`;

  function copyToken() {
    navigator.clipboard
      .writeText(token)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Ignore clipboard failures in insecure/local contexts.
      });
  }

  return (
    <span className='inline-flex max-w-full items-center gap-1.5'>
      <code
        className={cn(
          'min-w-0 max-w-40 font-mono text-2xs text-tertiary-token',
          isRevealed
            ? 'break-all whitespace-normal'
            : 'truncate overflow-hidden'
        )}
      >
        {visibleToken}
      </code>
      <IconButton
        type='button'
        variant='inline'
        size='xs'
        onClick={() => setIsRevealed(value => !value)}
        ariaLabel={isRevealed ? 'Hide investor token' : 'Reveal investor token'}
        aria-pressed={isRevealed}
      >
        {isRevealed ? (
          <EyeOff className='h-3 w-3' aria-hidden='true' />
        ) : (
          <Eye className='h-3 w-3' aria-hidden='true' />
        )}
      </IconButton>
      <IconButton
        type='button'
        variant='inline'
        size='xs'
        onClick={copyToken}
        ariaLabel='Copy Full Investor Token'
      >
        {copied ? (
          <Check
            className='h-3 w-3 text-success'
            aria-hidden='true'
            data-testid='token-copy-success'
          />
        ) : (
          <Copy className='h-3 w-3' aria-hidden='true' />
        )}
      </IconButton>
    </span>
  );
}

function StageBadge({ stage }: Readonly<{ stage: string }>) {
  const style = STAGE_STYLES[stage] ?? {
    label: stage.replaceAll('_', ' '),
    variant: 'secondary' as const,
  };

  return (
    <Badge variant={style.variant} size='sm'>
      {style.label}
    </Badge>
  );
}

function ScoreBadge({ score }: Readonly<{ score: number }>) {
  let toneClassName = 'text-secondary-token';

  if (score >= 50) {
    toneClassName = 'text-success';
  } else if (score >= 25) {
    toneClassName = 'text-warning';
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-[2.5rem] items-center justify-end font-mono text-xs font-semibold tabular-nums',
        toneClassName
      )}
    >
      {score}
    </span>
  );
}

function StatusBadge({ isActive }: Readonly<{ isActive: boolean }>) {
  return isActive ? (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CheckCircle2 className='h-3.5 w-3.5 text-success' aria-hidden='true' />
      Active
    </span>
  ) : (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CircleSlash
        className='h-3.5 w-3.5 text-tertiary-token'
        aria-hidden='true'
      />
      Disabled
    </span>
  );
}

function renderLabelCell({ row }: CellContext<InvestorPipelineRow, string>) {
  return (
    <div className='flex min-w-0 flex-col gap-0.5'>
      <span className='truncate font-semibold text-primary-token'>
        {row.original.label}
      </span>
      <InvestorTokenCopyButton token={row.original.token} />
    </div>
  );
}

function renderStageCell({
  getValue,
}: CellContext<InvestorPipelineRow, string>) {
  return <StageBadge stage={getValue()} />;
}

function renderScoreCell({
  getValue,
}: CellContext<InvestorPipelineRow, number>) {
  return <ScoreBadge score={getValue()} />;
}

function renderStatusCell({
  getValue,
}: CellContext<InvestorPipelineRow, boolean>) {
  return <StatusBadge isActive={getValue()} />;
}

function getInvestorRowId(row: InvestorPipelineRow) {
  return row.id;
}

function getInvestorRowTestId(row: InvestorPipelineRow) {
  return `admin-investor-row-${row.id}`;
}

const columnHelper = createColumnHelper<InvestorPipelineRow>();

const INVESTOR_PIPELINE_COLUMNS = [
  columnHelper.accessor('label', {
    header: 'Label',
    cell: renderLabelCell,
    size: 200,
    minSize: 180,
    enableSorting: false,
    meta: { cellContentClassName: 'whitespace-normal' },
  }),
  columnHelper.accessor('investorName', {
    header: 'Investor',
    size: 150,
    minSize: 140,
    enableSorting: false,
  }),
  columnHelper.accessor('stage', {
    header: 'Stage',
    cell: renderStageCell,
    size: 100,
    minSize: 96,
    enableSorting: false,
  }),
  columnHelper.accessor('engagementScore', {
    header: 'Score',
    cell: renderScoreCell,
    size: 64,
    minSize: 56,
    enableSorting: false,
  }),
  columnHelper.accessor('viewCount', {
    header: 'Views',
    size: 64,
    minSize: 56,
    enableSorting: false,
  }),
  columnHelper.accessor('lastViewedLabel', {
    header: 'Last Viewed',
    size: 110,
    minSize: 96,
    enableSorting: false,
  }),
  columnHelper.accessor('isActive', {
    header: 'Status',
    cell: renderStatusCell,
    size: 72,
    minSize: 64,
    enableSorting: false,
  }),
];

const INVESTOR_PIPELINE_EMPTY_STATE = (
  <TableEmptyState
    heading='No Investor Links Yet'
    description='Create a private link to start tracking an investor conversation.'
    action={{
      href: APP_ROUTES.ADMIN_INVESTORS_LINKS,
      label: 'Create Link',
    }}
    testId='admin-investors-empty-state'
  />
);

export function InvestorPipelineTable({
  rows,
  isLoading = false,
}: Readonly<InvestorPipelineTableProps>) {
  const columns = useMemo(
    () =>
      INVESTOR_PIPELINE_COLUMNS as ColumnDef<InvestorPipelineRow, unknown>[],
    []
  );

  return (
    <div className='min-w-0' data-testid='admin-investors-table'>
      <UnifiedTable
        data={rows}
        columns={columns}
        caption='Investor pipeline'
        isLoading={isLoading}
        skeletonRows={4}
        skeletonColumnConfig={INVESTOR_TABLE_SKELETON_COLUMN_CONFIG}
        emptyState={INVESTOR_PIPELINE_EMPTY_STATE}
        rowMode='two-line'
        minWidth={INVESTOR_TABLE_MIN_WIDTH}
        className='table-fixed'
        enableVirtualization={false}
        columnSnap={false}
        getRowId={getInvestorRowId}
        getRowTestId={getInvestorRowTestId}
      />
    </div>
  );
}
