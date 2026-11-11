'use client';
// @coverage-via apps/web/tests/unit/app/surface-elevation-guardrails.test.ts

import { Badge, type BadgeProps, Button } from '@jovie/ui';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import {
  type ContextMenuItemType,
  UnifiedTable,
} from '@/components/organisms/table';
import { TableEmptyState } from '@/components/organisms/table/atoms/TableEmptyState';
import { convertContextMenuItems } from '@/components/organisms/table/molecules/TableContextMenu';
import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@/lib/tanstack-table';
import type { TourDateViewModel } from '@/lib/tour-dates/types';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/utils/date-formatting';
import { buildTourDateActions } from './tour-date-actions';

/**
 * Whether a show has happened, against a clock read after mount. Before the
 * clock is known (server render and first client paint) nothing is past, so
 * server and client HTML match and rows never flip during hydration.
 */
function isPastDate(startDate: string, nowMs: number | null): boolean {
  return nowMs !== null && new Date(startDate).getTime() < nowMs;
}

/** Wall clock read once after mount; null during SSR and hydration. */
function useMountedNowMs(): number | null {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  return nowMs;
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
  nowMs,
}: {
  ticketStatus: TourDateViewModel['ticketStatus'];
  startDate: string;
  nowMs: number | null;
}) {
  const badge = (
    <StatusBadge
      status={ticketStatus}
      isPastDate={isPastDate(startDate, nowMs)}
    />
  );
  // Hold the badge (keeping its width) until the clock mounts, so a past show
  // never reads as on sale on first paint and then flips to Past.
  return nowMs === null ? <span className='invisible'>{badge}</span> : badge;
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
      aria-label='Buy Tickets (Opens In New Tab)'
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
  admin_import: {
    label: 'Admin Import',
    className: 'text-amber-600 dark:text-amber-400',
  },
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
  nowMs: number | null;
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
          nowMs={deps.nowMs}
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

  const nowMs = useMountedNowMs();

  const columns = useMemo(
    () =>
      buildTourDateColumns({ onSync, isSyncing, nowMs, getContextMenuItems }),
    [onSync, isSyncing, nowMs, getContextMenuItems]
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
      getRowClassName={row =>
        isPastDate(row.startDate, nowMs) ? 'opacity-60' : ''
      }
      enableVirtualization={tourDates.length >= 20}
      // Date and start time stack in two lines; the two-line mode gives
      // them a 48px content budget instead of clipping the time at 32px.
      rowMode='two-line'
      className='text-app'
      caption='Tour dates'
      emptyState={
        <TableEmptyState
          testId='tour-dates-table-empty'
          icon={<Icon name='Calendar' className='size-5' aria-hidden='true' />}
          heading='No Tour Dates'
          description='Add your first tour date to get started.'
        />
      }
    />
  );
}
