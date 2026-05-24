'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import { PageToolbar, TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';

// Local row shape (avoid server-only import from @/lib/admin/costs in client component)
interface AdminCostRow {
  readonly label: string;
  readonly monthlyUsd: string | number | null;
  readonly observed30dUsd: string | number | null;
  readonly period: string;
  readonly notes: string;
  readonly externalUrl?: string | null;
  readonly lastUpdatedLabel: string;
}

interface CostsTableProps {
  readonly items: AdminCostRow[];
  readonly lastRefreshedLabel: string;
}

const columnHelper = createColumnHelper<AdminCostRow>();

export function CostsTable({ items, lastRefreshedLabel }: CostsTableProps) {
  const columns = useMemo(
    () =>
      [
        columnHelper.accessor('label', {
          header: 'Provider',
          cell: info => (
            <div className='min-w-0 space-y-1'>
              <span className='block truncate font-medium text-primary-token'>
                {info.getValue()}
              </span>
              {info.row.original.notes ? (
                <span className='line-clamp-2 block max-w-[34rem] text-xs leading-[17px] text-secondary-token'>
                  {info.row.original.notes}
                </span>
              ) : null}
            </div>
          ),
          meta: { className: 'min-w-[280px]' },
        }),
        columnHelper.accessor('observed30dUsd', {
          header: '30d Spend (USD)',
          cell: info => {
            const v = info.getValue();
            const n = Number(v ?? 0);
            return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          },
          meta: { className: 'tabular-nums text-right' },
        }),
        columnHelper.accessor('monthlyUsd', {
          header: 'Est. Monthly',
          cell: info => {
            const v = info.getValue();
            const n = Number(v ?? 0);
            return n > 0
              ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
              : 'usage';
          },
          meta: { className: 'tabular-nums' },
        }),
        columnHelper.accessor('period', {
          header: 'Period',
          cell: info => (
            <span className='text-tertiary-token text-3xs uppercase tracking-wide'>
              {info.getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('lastUpdatedLabel', {
          header: 'Last Updated',
          cell: info => info.getValue(),
        }),
        columnHelper.accessor('externalUrl', {
          header: '',
          cell: info => {
            const url = info.getValue();
            if (!url) return null;
            return (
              <a
                href={url}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex text-primary-token hover:text-primary-token/80'
                aria-label={`Open ${info.row.original.label} dashboard`}
              >
                <ExternalLink className='h-3.5 w-3.5' />
              </a>
            );
          },
          enableSorting: false,
          meta: { className: 'w-8 text-right' },
        }),
      ] as ColumnDef<AdminCostRow, unknown>[],
    []
  );

  const total30d = items.reduce(
    (sum, r) => sum + Number(r.observed30dUsd ?? 0),
    0
  );

  const toolbar = (
    <PageToolbar
      start={
        <div className='flex items-center gap-3 text-tertiary-token text-xs'>
          <span>
            {items.length} items • ${total30d.toFixed(2)} in last 30d
          </span>
          <span className='opacity-60'>•</span>
          <span>Last refreshed: {lastRefreshedLabel}</span>
        </div>
      }
    />
  );

  return (
    <AdminTableShell testId='admin-costs-table' toolbar={toolbar}>
      {() => (
        <AdminDataTable
          data={items}
          columns={columns}
          emptyState={
            <TableEmptyState
              title='No cost items'
              description='Cost data is unavailable in this environment.'
            />
          }
        />
      )}
    </AdminTableShell>
  );
}
