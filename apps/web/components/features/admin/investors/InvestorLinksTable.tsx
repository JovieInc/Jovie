'use client';

import { Badge } from '@jovie/ui';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Copy, Link2, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  PageToolbar,
  PageToolbarSearchForm,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { cn } from '@/lib/utils';

export interface InvestorLinkRow {
  readonly id: string;
  readonly token: string;
  readonly label: string;
  readonly investorName: string | null;
  readonly email: string | null;
  readonly stage: string;
  readonly engagementScore: number;
  readonly isActive: boolean;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly viewCount: number;
  readonly lastViewed: string | null;
}

interface InvestorLinksTableProps {
  readonly links: readonly InvestorLinkRow[];
}

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
  shared: { label: 'Shared', variant: 'secondary' },
  viewed: { label: 'Viewed', variant: 'default' },
  engaged: { label: 'Engaged', variant: 'warning' },
  meeting_booked: { label: 'Meeting booked', variant: 'default' },
  committed: { label: 'Committed', variant: 'success' },
  wired: { label: 'Wired', variant: 'success' },
  passed: { label: 'Passed', variant: 'destructive' },
  declined: { label: 'Declined', variant: 'destructive' },
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const columnHelper = createColumnHelper<InvestorLinkRow>();

function TokenDisplay({ token }: Readonly<{ token: string }>) {
  return (
    <button
      type='button'
      onClick={() => {
        navigator.clipboard.writeText(token).catch(() => {
          // HTTP contexts can reject clipboard writes.
        });
      }}
      className='inline-flex items-center gap-1 text-[11px] text-tertiary-token transition-colors hover:text-secondary-token'
      title='Copy full token'
    >
      {token.slice(0, 8)}...
      <Copy className='h-3 w-3' aria-hidden='true' />
    </button>
  );
}

function renderLabelCell({
  row,
}: CellContext<InvestorLinkRow, InvestorLinkRow['label']>) {
  return (
    <div className='flex min-w-0 flex-col'>
      <span className='truncate font-[560] text-primary-token'>
        {row.original.label}
      </span>
      <TokenDisplay token={row.original.token} />
    </div>
  );
}

function renderInvestorCell({
  row,
}: CellContext<InvestorLinkRow, InvestorLinkRow['investorName']>) {
  return (
    <div className='flex min-w-0 flex-col'>
      <span className='truncate text-primary-token'>
        {row.original.investorName || 'Unknown investor'}
      </span>
      {row.original.email ? (
        <span className='truncate text-xs text-secondary-token'>
          {row.original.email}
        </span>
      ) : null}
    </div>
  );
}

function renderStageCell({
  getValue,
}: CellContext<InvestorLinkRow, InvestorLinkRow['stage']>) {
  const stage = getValue();
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

function renderScoreCell({
  getValue,
}: CellContext<InvestorLinkRow, InvestorLinkRow['engagementScore']>) {
  const score = getValue();
  let toneClassName = 'text-secondary-token';

  if (score >= 50) {
    toneClassName = 'text-success';
  } else if (score >= 25) {
    toneClassName = 'text-warning';
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-[2.5rem] items-center justify-end font-mono text-[12px] font-[590] tabular-nums',
        toneClassName
      )}
    >
      {score}
    </span>
  );
}

function renderLastViewedCell({
  getValue,
}: CellContext<InvestorLinkRow, InvestorLinkRow['lastViewed']>) {
  const lastViewed = getValue();
  return (
    <span className='whitespace-nowrap text-secondary-token'>
      {lastViewed ? dateFormatter.format(new Date(lastViewed)) : 'No views yet'}
    </span>
  );
}

function renderStatusCell({
  getValue,
}: CellContext<InvestorLinkRow, InvestorLinkRow['isActive']>) {
  return getValue() ? (
    <Badge variant='success' size='sm'>
      Active
    </Badge>
  ) : (
    <Badge variant='secondary' size='sm'>
      Disabled
    </Badge>
  );
}

export function InvestorLinksTable({
  links,
}: Readonly<InvestorLinksTableProps>) {
  const [search, setSearch] = useState('');

  const filteredLinks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return [...links];
    }

    return links.filter(link =>
      [
        link.label,
        link.investorName,
        link.email,
        link.token,
        link.stage,
        link.notes,
      ]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(normalizedSearch))
    );
  }, [links, search]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('label', {
        id: 'label',
        header: 'Label',
        cell: renderLabelCell,
        size: 220,
      }),
      columnHelper.accessor('investorName', {
        id: 'investor',
        header: 'Investor',
        cell: renderInvestorCell,
        size: 220,
      }),
      columnHelper.accessor('stage', {
        id: 'stage',
        header: 'Stage',
        cell: renderStageCell,
        size: 160,
      }),
      columnHelper.accessor('engagementScore', {
        id: 'score',
        header: 'Score',
        cell: renderScoreCell,
        size: 110,
      }),
      columnHelper.accessor('viewCount', {
        id: 'views',
        header: 'Views',
        cell: ({ getValue }) => (
          <span className='text-secondary-token'>{getValue()}</span>
        ),
        size: 90,
      }),
      columnHelper.accessor('lastViewed', {
        id: 'lastViewed',
        header: 'Last viewed',
        cell: renderLastViewedCell,
        size: 150,
      }),
      columnHelper.accessor('isActive', {
        id: 'status',
        header: 'Status',
        cell: renderStatusCell,
        size: 120,
      }),
    ],
    []
  );

  return (
    <div className='overflow-hidden'>
      <PageToolbar
        start={null}
        end={
          <PageToolbarSearchForm
            compact
            searchValue={search}
            onSearchValueChange={setSearch}
            placeholder='Search investor links...'
            ariaLabel='Search investor links'
            submitAriaLabel='Search investor links'
            submitIcon={<Search className='h-3.5 w-3.5' />}
            clearIcon={<X className='h-3.5 w-3.5' />}
            onClearAction={() => setSearch('')}
            tooltipLabel='Search'
          />
        }
      />
      <UnifiedTable
        data={filteredLinks}
        columns={columns as ColumnDef<InvestorLinkRow, unknown>[]}
        isLoading={false}
        getRowId={row => row.id}
        emptyState={
          search ? (
            <TableEmptyState
              title='No investor links match'
              description='Try a different search term.'
            />
          ) : (
            <div className='flex flex-col items-center gap-3 px-6 py-10 text-center'>
              <div className='flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token'>
                <Link2 className='h-4 w-4' aria-hidden='true' />
              </div>
              <p className='max-w-md text-[13px] leading-[19px] text-secondary-token'>
                Investor links become the canonical handoff surface for deck
                access, memo reviews, and response tracking.
              </p>
            </div>
          )
        }
        minWidth='960px'
      />
    </div>
  );
}
