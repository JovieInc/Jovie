'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { memo, useCallback, useMemo, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
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
  readonly tourDates: TourDateViewModel[];
  readonly onEdit: (tourDate: TourDateViewModel) => void;
  readonly onDelete: (id: string) => void;
  readonly onSync?: () => void;
  readonly isSyncing?: boolean;
}

const columnHelper = createColumnHelper<TourDateViewModel>();

const StatusBadge = memo(function StatusBadge({
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
});

const DateCell = memo(function DateCell({
  startDate,
  startTime,
}: {
  startDate: string;
  startTime: string | null;
}) {
  return (
    <div className='flex flex-col'>
      <span className='font-medium text-primary-token'>
        {formatShortDate(startDate)}
      </span>
      {startTime && (
        <span className='text-xs text-tertiary-token'>{startTime}</span>
      )}
    </div>
  );
});

const VenueCell = memo(function VenueCell({
  venueName,
}: {
  venueName: string;
}) {
  return <span className='text-primary-token truncate'>{venueName}</span>;
});

const LocationCell = memo(function LocationCell({
  city,
  region,
  country,
}: {
  city: string;
  region: string | null;
  country: string;
}) {
  const location = [city, region, country].filter(Boolean).join(', ');
  return <span className='text-secondary-token truncate'>{location}</span>;
});

const StatusCell = memo(function StatusCell({
  ticketStatus,
  startDate,
}: {
  ticketStatus: TourDateViewModel['ticketStatus'];
  startDate: string;
}) {
  const past = isPastDate(new Date(startDate));
  return <StatusBadge status={ticketStatus} isPastDate={past} />;
});

const TicketsCell = memo(function TicketsCell({
  ticketUrl,
}: {
  ticketUrl: string | null;
}) {
  if (!ticketUrl) {
    return <span className='text-tertiary-token'>-</span>;
  }
  return (
    <a
      href={ticketUrl}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center gap-1 text-accent hover:underline'
      onClick={event => event.stopPropagation()}
      aria-label='Buy tickets (opens in new tab)'
    >
      <Icon name='Ticket' className='h-4 w-4' aria-hidden='true' />
      <span className='text-sm'>Buy</span>
    </a>
  );
});

const PROVIDER_CONFIG: Record<
  TourDateViewModel['provider'],
  { label: string; className: string }
> = {
  bandsintown: {
    label: 'Bandsintown',
    className: 'text-teal-600 dark:text-teal-400',
  },
  songkick: {
    label: 'Songkick',
    className: 'text-pink-600 dark:text-pink-400',
  },
  manual: { label: 'Manual', className: 'text-tertiary-token' },
};

const SourceCell = memo(function SourceCell({
  provider,
}: {
  provider: TourDateViewModel['provider'];
}) {
  const config = PROVIDER_CONFIG[provider];

  return (
    <span className={cn('text-xs', config.className)}>{config.label}</span>
  );
});

const ActionsHeader = memo(function ActionsHeader({
  onSync,
  isSyncing,
}: {
  onSync?: () => void;
  isSyncing?: boolean;
}) {
  return (
    <div className='flex items-center justify-end gap-2'>
      {onSync && (
        <button
          type='button'
          onClick={event => {
            event.stopPropagation();
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
  );
});

const ActionsCell = memo(function ActionsCell({
  tourDate,
  onEdit,
}: {
  tourDate: TourDateViewModel;
  onEdit: (tourDate: TourDateViewModel) => void;
}) {
  return (
    <div className='flex items-center justify-end'>
      <button
        type='button'
        aria-label={`Edit ${tourDate.venueName} tour date`}
        onClick={event => {
          event.stopPropagation();
          onEdit(tourDate);
        }}
        className='rounded p-1 text-tertiary-token hover:bg-surface-2 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
      >
        <Icon name='MoreHorizontal' className='h-4 w-4' />
      </button>
    </div>
  );
});

/** Standalone cell renderer for Location column (avoids defining inside parent component). */
function LocationCellRenderer({
  row,
}: {
  readonly row: { readonly original: TourDateViewModel };
}) {
  return (
    <LocationCell
      city={row.original.city}
      region={row.original.region}
      country={row.original.country}
    />
  );
}

/** Standalone cell renderer for Actions column (avoids defining inside parent component). */
function ActionsCellRenderer({
  row,
  onEdit,
}: {
  readonly row: { readonly original: TourDateViewModel };
  readonly onEdit: (tourDate: TourDateViewModel) => void;
}) {
  return <ActionsCell tourDate={row.original} onEdit={onEdit} />;
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
            globalThis.open(
              tourDate.ticketUrl!,
              '_blank',
              'noopener,noreferrer'
            ),
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

  // TanStack Table requires render functions in column definitions.
  // All components are properly extracted and memoized at file level (lines 34-223).
  const columns = useMemo(() => {
    return [
      // Date column
      columnHelper.accessor('startDate', {
        id: 'startDate',
        header: 'Date',
        cell: info => ( // NOSONAR
          <DateCell
            startDate={info.getValue()}
            startTime={info.row.original.startTime}
          />
        ),
        size: 120,
        enableSorting: true,
      }),

      // Venue column
      columnHelper.accessor('venueName', {
        id: 'venue',
        header: 'Venue',
        cell: info => <VenueCell venueName={info.getValue()} />, // NOSONAR
        size: 200,
        enableSorting: true,
      }),

      // Location column
      columnHelper.display({
        id: 'location',
        header: 'Location',
        cell: ({ row }) => <LocationCellRenderer row={row} />, // NOSONAR - TanStack Table render prop
        size: 180,
      }),

      // Status column
      columnHelper.accessor('ticketStatus', {
        id: 'status',
        header: 'Status',
        cell: info => ( // NOSONAR
          <StatusCell
            ticketStatus={info.getValue()}
            startDate={info.row.original.startDate}
          />
        ),
        size: 100,
      }),

      // Tickets column
      columnHelper.display({
        id: 'tickets',
        header: 'Tickets',
        cell: ({ row }) => <TicketsCell ticketUrl={row.original.ticketUrl} />, // NOSONAR
        size: 80,
      }),

      // Source column
      columnHelper.accessor('provider', {
        id: 'source',
        header: 'Source',
        cell: info => <SourceCell provider={info.getValue()} />, // NOSONAR
        size: 100,
      }),

      // Actions column
      columnHelper.display({
        id: 'actions',
        header: () => <ActionsHeader onSync={onSync} isSyncing={isSyncing} />, // NOSONAR
        cell: ({ row }) => <ActionsCellRenderer row={row} onEdit={onEdit} />, // NOSONAR - TanStack Table render prop
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
      emptyState={
        <div className='px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3'>
          <Icon name='Calendar' className='h-6 w-6' />
          <div>
            <div className='font-medium'>No tour dates</div>
            <div className='text-xs'>
              Add your first tour date to get started.
            </div>
          </div>
        </div>
      }
    />
  );
}
