'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { Users } from 'lucide-react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import type { TipperRow } from '@/lib/queries';

// =============================================================================
// Helpers
// =============================================================================

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =============================================================================
// Column definitions
// =============================================================================

const tipperColumnHelper = createColumnHelper<TipperRow>();

const tipperColumns = [
  tipperColumnHelper.accessor('tipperName', {
    header: 'Name',
    size: 160,
    cell: ({ getValue }) => (
      <span className='text-primary-token'>{getValue() ?? 'Anonymous'}</span>
    ),
  }),
  tipperColumnHelper.accessor('contactEmail', {
    header: 'Email',
    size: 200,
    cell: ({ getValue }) => (
      <span className='text-secondary-token'>{getValue() ?? '--'}</span>
    ),
  }),
  tipperColumnHelper.accessor('amountCents', {
    header: 'Amount',
    size: 100,
    meta: { align: 'right' },
    cell: ({ getValue }) => (
      <span className='text-right font-[510] tabular-nums text-primary-token'>
        {formatCents(getValue())}
      </span>
    ),
  }),
  tipperColumnHelper.accessor('createdAt', {
    header: 'Date',
    size: 120,
    meta: { align: 'right' },
    cell: ({ getValue }) => (
      <span className='text-right text-secondary-token'>
        {formatDate(getValue())}
      </span>
    ),
  }),
];

// =============================================================================
// Main Component
// =============================================================================

interface EarningsTippersTabProps {
  readonly tippers: TipperRow[];
  readonly isLoading: boolean;
}

export function EarningsTippersTab({
  tippers,
  isLoading,
}: EarningsTippersTabProps) {
  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      <ContentSurfaceCard className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <UnifiedTable
          data={tippers}
          columns={tipperColumns as ColumnDef<TipperRow, unknown>[]}
          isLoading={isLoading}
          getRowId={row => row.id}
          enableVirtualization={false}
          emptyState={
            <TableEmptyState
              icon={<Users className='h-5 w-5' />}
              title='No tips yet'
              description='Share your tip link to get started.'
            />
          }
        />
      </ContentSurfaceCard>
    </div>
  );
}
