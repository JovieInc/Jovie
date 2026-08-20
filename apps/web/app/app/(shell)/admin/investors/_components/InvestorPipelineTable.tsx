'use client';

import { Badge } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { CheckCircle2, CircleSlash } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { AdminInvestorPipelineRow } from '../investors-data';
import { TokenCopyButton } from '../TokenCopyButton';

interface InvestorPipelineTableProps {
  readonly links: readonly AdminInvestorPipelineRow[];
}

const columnHelper = createColumnHelper<AdminInvestorPipelineRow>();

function StageBadge({ stage }: Readonly<{ stage: string }>) {
  const styles: Record<
    string,
    {
      label: string;
      variant: 'default' | 'secondary' | 'warning' | 'success' | 'destructive';
    }
  > = {
    shared: { label: 'Shared', variant: 'secondary' },
    viewed: { label: 'Viewed', variant: 'default' },
    engaged: { label: 'Engaged', variant: 'warning' },
    meeting_booked: { label: 'Meeting Booked', variant: 'default' },
    committed: { label: 'Committed', variant: 'success' },
    wired: { label: 'Wired', variant: 'success' },
    passed: { label: 'Passed', variant: 'destructive' },
    declined: { label: 'Declined', variant: 'destructive' },
  };
  const style = styles[stage] ?? {
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
  const toneClassName =
    score >= 50
      ? 'text-success'
      : score >= 25
        ? 'text-warning'
        : 'text-secondary-token';

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
      <CheckCircle2 className='h-3.5 w-3.5 text-success' aria-hidden />
      Active
    </span>
  ) : (
    <span className='inline-flex items-center gap-1.5 text-xs text-secondary-token'>
      <CircleSlash className='h-3.5 w-3.5 text-tertiary-token' aria-hidden />
      Disabled
    </span>
  );
}

const columns = [
  columnHelper.accessor('label', {
    header: 'Label',
    cell: info => (
      <div className='flex min-w-0 flex-col gap-0.5'>
        <span className='truncate font-semibold text-primary-token'>
          {info.getValue()}
        </span>
        <TokenCopyButton token={info.row.original.token} />
      </div>
    ),
    meta: { className: 'w-investor-label' },
  }),
  columnHelper.accessor('investorName', {
    header: 'Investor',
    cell: info => info.getValue() || 'Unknown investor',
    meta: { className: 'w-investor-name' },
  }),
  columnHelper.accessor('stage', {
    header: 'Stage',
    cell: info => <StageBadge stage={info.getValue()} />,
    meta: { className: 'w-investor-stage' },
  }),
  columnHelper.accessor('engagementScore', {
    header: 'Score',
    cell: info => <ScoreBadge score={info.getValue()} />,
    meta: { className: 'w-16 text-right' },
  }),
  columnHelper.accessor('viewCount', {
    header: 'Views',
    meta: { className: 'w-16' },
  }),
  columnHelper.accessor('lastViewed', {
    header: 'Last Viewed',
    cell: info =>
      info.getValue()
        ? new Date(info.getValue()!).toLocaleDateString()
        : 'No views yet',
    meta: { className: 'w-investor-date' },
  }),
  columnHelper.accessor('isActive', {
    header: 'Status',
    cell: info => <StatusBadge isActive={info.getValue()} />,
    meta: { className: 'w-investor-status' },
  }),
];

export function InvestorPipelineTable({ links }: InvestorPipelineTableProps) {
  return (
    <ContentSurfaceCard
      surface='table'
      className='overflow-hidden p-0'
      data-testid='admin-investors-table'
    >
      <UnifiedTable
        data={[...links]}
        columns={columns as ColumnDef<AdminInvestorPipelineRow, unknown>[]}
        enableVirtualization={false}
        rowHeight={40}
        minWidth='760px'
        getRowId={link => link.id}
        emptyState={
          <TableEmptyState
            heading='No investor links yet'
            description='Create an investor link to begin tracking fundraising conversations.'
          />
        }
      />
    </ContentSurfaceCard>
  );
}
