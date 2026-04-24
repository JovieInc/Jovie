'use client';

import { Badge, type BadgeProps, Button } from '@jovie/ui';
import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import { memo, useCallback, useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  type ContextMenuItemType,
  UnifiedTable,
} from '@/components/organisms/table';
import { convertContextMenuItems } from '@/components/organisms/table/molecules/TableContextMenu';
import { TABLE_ROW_HEIGHTS } from '@/lib/constants/layout';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
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

const STATUS_BADGE: Record<
  'past' | 'sold_out' | 'cancelled' | 'on_sale',
  { variant: BadgeProps['variant']; label: string }
> = {
  past: { variant: 'secondary', label: 'Past' },
  sold_out: { variant: 'warning', label: 'Sold Out' },
  cancelled: { variant: 'destructive', label: 'Cancelled' },
  on_sale: { variant: 'success', label: 'On Sale' },
};

const StatusBadge = memo(function StatusBadge({
  status,
  isPastDate,
}: {
  status: string;
  isPastDate: boolean;
}) {
  let config = STATUS_BADGE.on_sale;
  if (isPastDate) config = STATUS_BADGE.past;
  else if (status === 'sold_out') config = STATUS_BADGE.sold_out;
  else if (status === 'cancelled') config = STATUS_BADGE.cancelled;

  return (
    <Badge variant={config.variant} size='sm'>
      {config.label}
    </Badge>
  );
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
      <span className='font-caption text-primary-token'>
        {formatShortDate(startDate)}
      </span>
      {startTime && (
        <span className='text-app text-tertiary-token'>{startTime}</span>
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
      <span className='text-app'>Buy</span>
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
    <span className={cn('text-app', config.className)}>{config.label}</span>
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
          className='h-8 gap-1 rounded-md px-2.5 text-app text-secondary-token hover:bg-surface-0 hover:text-primary-token'
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

/** Build column definitions for tour dates table (file-level to satisfy S6478). */
function buildTourDateColumns(deps: {
  onSync?: () => void;
  isSyncing?: boolean;
  getContextMenuItems: (tourDate: TourDateViewModel) => ContextMenuItemType[];
}) {
  return [
    columnHelper.accessor('startDate', {
      id: 'startDate',
      header: 'Date',
      cell: info => (
        <DateCell
          startDate={info.getValue()}
          startTime={info.row.original.startTime}
        />
      ),
      size: 120,
      enableSorting: true,
    }),
    columnHelper.accessor('venueName', {
      id: 'venue',
      header: 'Venue',
      cell: info => <VenueCell venueName={info.getValue()} />,
      size: 200,
      enableSorting: true,
    }),
    columnHelper.display({
      id: 'location',
      header: 'Location',
      cell: ({ row }) => <LocationCellRenderer row={row} />,
      size: 180,
    }),
    columnHelper.accessor('ticketStatus', {
      id: 'status',
      header: 'Status',
      cell: info => (
        <StatusCell
          ticketStatus={info.getValue()}
          startDate={info.row.original.startDate}
        />
      ),
      size: 100,
    }),
    columnHelper.display({
      id: 'tickets',
      header: 'Tickets',
      cell: ({ row }) => <TicketsCell ticketUrl={row.original.ticketUrl} />,
      size: 80,
    }),
    columnHelper.accessor('provider', {
      id: 'source',
      header: 'Source',
      cell: info => <SourceCell provider={info.getValue()} />,
      size: 100,
    }),
    columnHelper.display({
      id: 'actions',
      header: () => (
        <ActionsHeader onSync={deps.onSync} isSyncing={deps.isSyncing} />
      ),
      cell: ({ row }) => (
        <ActionsCellRenderer
          row={row}
          getContextMenuItems={deps.getContextMenuItems}
        />
      ),
      size: 80,
    }),
  ];
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

  const columns = useMemo(
    () => buildTourDateColumns({ onSync, isSyncing, getContextMenuItems }),
    [onSync, isSyncing, getContextMenuItems]
  );

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
      className='text-app'
      emptyState={
        <div className='px-4 py-8'>
          <ContentSurfaceCard className='flex flex-col items-center gap-3 bg-surface-0 px-3 py-6 text-center text-app text-secondary-token'>
            <Icon name='Calendar' className='h-6 w-6 text-tertiary-token' />
            <div>
              <div className='font-caption text-primary-token'>
                No tour dates
              </div>
              <div className='text-app'>
                Add your first tour date to get started.
              </div>
            </div>
          </ContentSurfaceCard>
        </div>
      }
    />
  );
}
