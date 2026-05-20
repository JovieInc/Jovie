'use client';

import { Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageToolbar, TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';

// Local row shape (avoid server-only import from @/lib/admin/costs in client component)
interface AdminCostRow {
  readonly label: string;
  readonly monthlyUsd: string | number | null;
  readonly observed30dUsd: string | number | null;
  readonly period: string;
  readonly notes: string | null;
  readonly externalUrl?: string | null;
  readonly lastUpdatedLabel: string;
}

interface CostsTableProps {
  readonly items: AdminCostRow[];
  readonly lastRefreshedLabel: string;
}

const columnHelper = createColumnHelper<AdminCostRow>();

export function CostsTable({ items, lastRefreshedLabel }: CostsTableProps) {
  const [localRefreshed, setLocalRefreshed] = useState(lastRefreshedLabel);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const columns = useMemo(
    () =>
      [
        columnHelper.accessor('label', {
          header: 'Line Item / Provider',
          cell: info => (
            <span className='font-medium text-primary-token'>
              {info.getValue()}
            </span>
          ),
          meta: { className: 'min-w-[220px]' },
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
        columnHelper.accessor('notes', {
          header: 'Notes',
          cell: info => (
            <span className='line-clamp-2 text-tertiary-token text-xs'>
              {info.getValue() || '—'}
            </span>
          ),
          meta: { className: 'max-w-[320px]' },
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

  async function handleMarkRefreshed() {
    setIsRefreshing(true);
    // v1: client-side only bump (no real persistence required per charter)
    const now = new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    setLocalRefreshed(now);
    setIsRefreshing(false);
    toast.success(
      'Marked refreshed (v1 manual — copy real numbers from dashboards)'
    );
  }

  const toolbar = (
    <PageToolbar
      start={
        <div className='flex items-center gap-3 text-tertiary-token text-xs'>
          <span>
            {items.length} items • ${total30d.toFixed(2)} in last 30d
          </span>
          <span className='opacity-60'>•</span>
          <span>Last refreshed: {localRefreshed}</span>
        </div>
      }
      end={
        <Button
          variant='outline'
          size='sm'
          onClick={handleMarkRefreshed}
          disabled={isRefreshing}
          className='gap-1.5'
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          Mark refreshed
        </Button>
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
              description='Seed data will appear on first load.'
            />
          }
        />
      )}
    </AdminTableShell>
  );
}
