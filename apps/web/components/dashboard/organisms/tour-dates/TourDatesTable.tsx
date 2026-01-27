'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import {
  type ContextMenuItemType,
  UnifiedTable,
} from '@/components/organisms/table';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/utils/date-formatting';

/** Check if a date is in the past */
function isPastDate(date: Date): boolean {
  return date.getTime() < Date.now();
}

interface TourDatesTableProps {
  tourDates: TourDateViewModel[];
  onEdit: (tourDate: TourDateViewModel) => void;
  onDelete: (id: string) => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

const columnHelper = createColumnHelper<TourDateViewModel>();

function StatusBadge({
  status,
  isPastDate,
}: {
  status: string;
  isPastDate: boolean;
}) {
  if (isPastDate) {
    return (
      <span className='inline-flex items-center rounded-md bg-surface-3 px-2 py-0.5 text-xs font-medium text-tertiary-token'>
        Past
      </span>
    );
  }

  switch (status) {
    case 'sold_out':
      return (
        <span className='inline-flex items-center rounded-md bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning'>
          Sold Out
        </span>
      );
    case 'cancelled':
      return (
        <span className='inline-flex items-center rounded-md bg-error-subtle px-2 py-0.5 text-xs font-medium text-error'>
          Cancelled
        </span>
      );
    default:
      return (
        <span className='inline-flex items-center rounded-md bg-success-subtle px-2 py-0.5 text-xs font-medium text-success'>
          On Sale
        </span>
      );
  }
}

export function TourDatesTable({
  tourDates,
  onEdit,
  onDelete,
  onSync,
  isSyncing,
}: TourDatesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'startDate', desc: false },
  ]);

  const getContextMenuItems = useCallback(
    (tourDate: TourDateViewModel): ContextMenuItemType[] => {
      const items: ContextMenuItemType[] = [
        {
          id: 'edit',
          label: 'Edit',
          icon: <Icon name='PencilLine' className='h-4 w-4' />,
          onClick: () => onEdit(tourDate),
        },
      ];

      if (tourDate.ticketUrl) {
        items.push({
          id: 'open-tickets',
          label: 'Open ticket link',
          icon: <Icon name='ExternalLink' className='h-4 w-4' />,
          onClick: () =>
            window.open(tourDate.ticketUrl!, '_blank', 'noopener,noreferrer'),
        });
      }

      items.push({
        id: 'delete',
        label: 'Delete',
        icon: <Icon name='Trash2' className='h-4 w-4' />,
        onClick: () => onDelete(tourDate.id),
        destructive: true,
      });

      return items;
    },
    [onEdit, onDelete]
  );

  // NOSONAR S6478: Cell renderers are TanStack Table render props, not React components.
  // They are memoized via useMemo and don't cause re-mounting issues.
  const columns = useMemo(() => {
    return [
      // Date column
      columnHelper.accessor('startDate', {
        id: 'startDate',
        header: 'Date',
        cell: info => {
          const tourDate = info.row.original;
          return (
            <div className='flex flex-col'>
              <span className='font-medium text-primary-token'>
                {formatShortDate(info.getValue())}
              </span>
              {tourDate.startTime && (
                <span className='text-xs text-tertiary-token'>
                  {tourDate.startTime}
                </span>
              )}
            </div>
          );
        },
        size: 120,
        enableSorting: true,
      }),

      // Venue column
      columnHelper.accessor('venueName', {
        id: 'venue',
        header: 'Venue',
        cell: info => (
          <span className='text-primary-token truncate'>{info.getValue()}</span>
        ),
        size: 200,
        enableSorting: true,
      }),

      // Location column
      columnHelper.display({
        id: 'location',
        header: 'Location',
        cell: ({ row }) => {
          const { city, region, country } = row.original;
          const location = [city, region, country].filter(Boolean).join(', ');
          return (
            <span className='text-secondary-token truncate'>{location}</span>
          );
        },
        size: 180,
      }),

      // Status column
      columnHelper.accessor('ticketStatus', {
        id: 'status',
        header: 'Status',
        cell: info => {
          const tourDate = info.row.original;
          const past = isPastDate(new Date(tourDate.startDate));
          return <StatusBadge status={info.getValue()} isPastDate={past} />;
        },
        size: 100,
      }),

      // Tickets column
      columnHelper.display({
        id: 'tickets',
        header: 'Tickets',
        cell: ({ row }) => {
          const tourDate = row.original;
          if (!tourDate.ticketUrl) {
            return <span className='text-tertiary-token'>-</span>;
          }
          return (
            <a
              href={tourDate.ticketUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 text-accent hover:underline'
              onClick={e => e.stopPropagation()}
            >
              <Icon name='Ticket' className='h-4 w-4' />
              <span className='text-sm'>Buy</span>
            </a>
          );
        },
        size: 80,
      }),

      // Source column
      columnHelper.accessor('provider', {
        id: 'source',
        header: 'Source',
        cell: info => {
          const provider = info.getValue();
          return (
            <span
              className={cn(
                'text-xs',
                provider === 'bandsintown'
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-tertiary-token'
              )}
            >
              {provider === 'bandsintown' ? 'Bandsintown' : 'Manual'}
            </span>
          );
        },
        size: 100,
      }),

      // Actions column
      columnHelper.display({
        id: 'actions',
        header: () => (
          <div className='flex items-center justify-end gap-2'>
            {onSync && (
              <button
                type='button'
                onClick={e => {
                  e.stopPropagation();
                  onSync();
                }}
                disabled={isSyncing}
                className='inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-secondary-token hover:bg-surface-2 disabled:opacity-50'
              >
                <Icon
                  name='RefreshCw'
                  className={cn('h-4 w-4', isSyncing && 'animate-spin')}
                />
                Sync
              </button>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const tourDate = row.original;
          return (
            <div className='flex items-center justify-end'>
              <button
                type='button'
                aria-label={`Edit ${tourDate.venueName} tour date`}
                onClick={e => {
                  e.stopPropagation();
                  onEdit(tourDate);
                }}
                className='rounded p-1 text-tertiary-token hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
              >
                <Icon name='MoreHorizontal' className='h-4 w-4' />
              </button>
            </div>
          );
        },
        size: 80,
      }),
    ];
  }, [onSync, isSyncing, onEdit]);

  return (
    <UnifiedTable
      data={tourDates}
      columns={columns as ColumnDef<TourDateViewModel, unknown>[]}
      sorting={sorting}
      onSortingChange={setSorting}
      getContextMenuItems={getContextMenuItems}
      onRowClick={onEdit}
      getRowId={row => row.id}
      getRowClassName={row => {
        const past = isPastDate(new Date(row.startDate));
        return cn('group hover:bg-surface-2/50', past && 'opacity-60');
      }}
      enableVirtualization={tourDates.length >= 20}
      rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
      className='text-[13px]'
    />
  );
}
