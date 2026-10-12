'use client';

import { IconButton } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo } from 'react';
import {
  PageToolbar,
  TABLE_CELL_MULTILINE_CONTENT_CLASSNAME,
  TableEmptyState,
} from '@/components/organisms/table';
import { TableDescription } from '@/components/organisms/table/molecules/TableDescription';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { formatAmount } from '@/lib/utils/format-number';

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

function observedAmount(value: string | number | null): number | null {
  if (value === null || (typeof value === 'string' && value.trim() === ''))
    return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
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
                <TableDescription
                  text={info.row.original.notes}
                  label={`${info.getValue()} notes`}
                />
              ) : null}
            </div>
          ),
          meta: {
            className: 'min-w-70',
            cellContentClassName: TABLE_CELL_MULTILINE_CONTENT_CLASSNAME,
          },
        }),
        columnHelper.accessor('observed30dUsd', {
          header: '30D Spend (USD)',
          cell: info => {
            const v = info.getValue();
            const n = observedAmount(v);
            if (n === null) return 'Not observed';
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
              <IconButton
                asChild
                variant='inline'
                size='xs'
                ariaLabel={`Open ${info.row.original.label} dashboard`}
              >
                <a href={url} target='_blank' rel='noopener noreferrer'>
                  <ExternalLink aria-hidden />
                </a>
              </IconButton>
            );
          },
          enableSorting: false,
          meta: { className: 'w-8 text-right' },
        }),
      ] as ColumnDef<AdminCostRow, unknown>[],
    []
  );

  const observed = items.flatMap(row => {
    const amount = observedAmount(row.observed30dUsd);
    return amount === null ? [] : [amount];
  });
  const total30d = observed.reduce((sum, amount) => sum + amount, 0);
  const spendLabel =
    observed.length === 0
      ? 'Spend not observed'
      : `${formatAmount(Math.round(total30d * 100))} recorded in last 30d`;

  const toolbar = (
    <PageToolbar
      start={
        <div className='flex items-center gap-3 text-tertiary-token text-xs'>
          <span>
            {items.length} items • {spendLabel} • {observed.length}/
            {items.length} items observed
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
          rowMode='description'
          data={items}
          columns={columns}
          emptyState={
            <TableEmptyState
              heading='No cost items'
              description='No manual cost records have been added. Spend has not been observed.'
            />
          }
        />
      )}
    </AdminTableShell>
  );
}
