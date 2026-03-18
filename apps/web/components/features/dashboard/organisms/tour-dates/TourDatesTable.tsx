'use client';

import { Button } from '@jovie/ui';
import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { memo, useCallback, useMemo, useState } from 'react';
import type { TourDateViewModel } from '@/app/app/(shell)/dashboard/tour-dates/actions';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type ContextMenuItemType,
  UnifiedTable,
} from '@/components/organisms/table';
import { convertContextMenuItems } from '@/components/organisms/table/molecules/TableContextMenu';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/utils/date-formatting';
import { buildTourDateActions } from './tour-date-actions';

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
      <span className='inline-flex items-center rounded-[7px] border border-subtle bg-surface-0 px-2 py-0.5 text-[12px] font-[510] text-tertiary-token'>
        Past
      </span>
    );
  }

  switch (status) {
    case 'sold_out':
      return (
        <span className='inline-flex items-center rounded-[7px] border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[12px] font-[510] text-amber-600 dark:text-amber-300'>
          Sold Out
        </span>
      );
    case 'cancelled':
      return (
        <span className='inline-flex items-center rounded-[7px] border border-red-500/20 bg-red-500/8 px-2 py-0.5 text-[12px] font-[510] text-red-600 dark:text-red-400'>
          Cancelled
        </span>
      );
    default:
      return (
        <span className='inline-flex items-center rounded-[7px] border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[12px] font-[510] text-emerald-600 dark:text-emerald-400'>
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
      <span className='font-[510] text-primary-token'>
        {formatShortDate(startDate)}
      </span>
      {startTime && (
        <span className='text-[13px] text-tertiary-token'>{startTime}</span>
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
      <span className='text-[13px]'>Buy</span>
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
    <span className={cn('text-[13px]', config.className)}>{config.label}</span>
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
        <Button
          onClick={event => {
            event.stopPropagation();
            onSync();
          }}
          disabled={isSyncing}
          variant='ghost'
          size='sm'
          className='h-8 gap-1 rounded-[8px] px-2.5 text-[13px] text-secondary-token hover:bg-surface-0 hover:text-primary-token'
        >
          <Icon
            name='RefreshCw'
            className={cn('h-4 w-4', isSyncing && 'animate-spin')}
          />
          Sync
        </Button>
      )}
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

/** Standalone cell renderer for Actions column — renders kebab menu from shared action builder. */
function ActionsCellRenderer({
  row,
  getContextMenuItems,
}: {
  readonly row: { readonly original: TourDateViewModel };
  readonly getContextMenuItems: (
    tourDate: TourDateViewModel
  ) => ContextMenuItemType[];
}) {
  const items = convertContextMenuItems(getContextMenuItems(row.original));
  return (
    <div className='flex items-center justify-end'>
      <TableActionMenu items={items} align='end' />
    </div>
  );
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
      return buildTourDateActions(tourDate, { onEdit, onDelete });
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
        cell: ({ row }) => (
          <ActionsCellRenderer
            row={row}
            getContextMenuItems={getContextMenuItems}
          />
        ), // NOSONAR - TanStack Table render prop
        size: 80,
      }),
    ];
  }, [onSync, isSyncing, getContextMenuItems]);

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
        return cn('group hover:bg-white/[0.02]', past && 'opacity-60');
      }}
      enableVirtualization={tourDates.length >= 20}
      rowHeight={TABLE_ROW_HEIGHTS.STANDARD}
      className='text-[13px]'
      emptyState={
        <div className='px-4 py-8'>
          <ContentSurfaceCard className='flex flex-col items-center gap-3 bg-surface-0 px-4 py-8 text-center text-[13px] text-secondary-token'>
            <Icon name='Calendar' className='h-6 w-6 text-tertiary-token' />
            <div>
              <div className='font-[510] text-primary-token'>No tour dates</div>
              <div className='text-[13px]'>
                Add your first tour date to get started.
              </div>
            </div>
          </ContentSurfaceCard>
        </div>
      }
    />
  );
}
