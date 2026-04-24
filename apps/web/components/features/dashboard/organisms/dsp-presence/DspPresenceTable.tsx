'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { useCallback } from 'react';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { UnifiedTable } from '@/components/organisms/table';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { isExternalDspImage } from '@/lib/utils/dsp-images';

// ============================================================================
// Props
// ============================================================================

interface DspPresenceTableProps {
  readonly items: DspPresenceItem[];
  readonly selectedMatchId: string | null;
  readonly onRowSelect: (item: DspPresenceItem) => void;
}

// ============================================================================
// Cell renderers (extracted to module scope to avoid re-creation on render)
// ============================================================================

function ArtistCell({ item }: Readonly<{ item: DspPresenceItem }>) {
  const label = PROVIDER_LABELS[item.providerId];
  return (
    <div className='flex items-center gap-2.5 min-w-0'>
      {item.externalArtistImageUrl ? (
        <div className='relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-subtle bg-surface-1'>
          <Image
            src={item.externalArtistImageUrl}
            alt={item.externalArtistName ?? label}
            fill
            sizes='24px'
            className='object-cover'
            unoptimized={isExternalDspImage(item.externalArtistImageUrl)}
          />
        </div>
      ) : (
        <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-1'>
          <DspProviderIcon provider={item.providerId} size='sm' />
        </div>
      )}
      <span className='truncate whitespace-nowrap font-caption text-app text-primary-token'>
        {item.externalArtistName ?? 'Unknown Artist'}
      </span>
    </div>
  );
}

function StatusCell({ item }: Readonly<{ item: DspPresenceItem }>) {
  const isManual = item.matchSource === 'manual';
  return isManual ? (
    <span className='text-2xs text-tertiary-token'>Manual</span>
  ) : (
    <MatchStatusBadge status={item.status} size='sm' />
  );
}

function LinkCell({ item }: Readonly<{ item: DspPresenceItem }>) {
  const label = PROVIDER_LABELS[item.providerId];
  if (!item.externalArtistUrl) return null;
  return (
    <a
      href={item.externalArtistUrl}
      target='_blank'
      rel='noopener noreferrer'
      className='flex h-6 w-6 items-center justify-center rounded text-tertiary-token transition-colors hover:text-primary-token'
      aria-label={`View on ${label}`}
      onClick={e => e.stopPropagation()}
    >
      <ExternalLink className='h-3.5 w-3.5' />
    </a>
  );
}

// ============================================================================
// Column definitions
// ============================================================================

const columnHelper = createColumnHelper<DspPresenceItem>();

const columns: ColumnDef<DspPresenceItem, unknown>[] = [
  columnHelper.accessor('externalArtistName', {
    id: 'artist',
    header: 'Artist',
    cell: info => <ArtistCell item={info.row.original} />,
    size: 9999,
    enableSorting: false,
    meta: { className: 'pl-4 pr-2' },
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    cell: info => <StatusCell item={info.row.original} />,
    size: 120,
    enableSorting: false,
    meta: { className: 'px-2' },
  }),
  columnHelper.display({
    id: 'externalLink',
    header: '',
    cell: info => <LinkCell item={info.row.original} />,
    size: 44,
    enableSorting: false,
    meta: { className: 'pr-4 pl-2' },
  }),
] as ColumnDef<DspPresenceItem, unknown>[];

// ============================================================================
// Component
// ============================================================================

export function DspPresenceTable({
  items,
  selectedMatchId,
  onRowSelect,
}: DspPresenceTableProps) {
  const getRowId = useCallback((row: DspPresenceItem) => row.matchId, []);
  const getRowTestId = useCallback(
    (row: DspPresenceItem) => `presence-match-row-${row.providerId}`,
    []
  );

  const getRowClassName = useCallback(
    (row: DspPresenceItem) => {
      const isSelected = selectedMatchId === row.matchId;

      if (isSelected) {
        return [
          'rounded-[10px] transition-[background-color,box-shadow] duration-150 ease-out cursor-pointer',
          'bg-[color-mix(in_oklab,var(--linear-row-selected)_24%,var(--linear-bg-surface-0))]',
          'shadow-[inset_2px_0_0_0_var(--linear-border-focus),inset_0_0_0_1px_color-mix(in_oklab,var(--linear-border-focus)_14%,var(--linear-app-frame-seam))]',
          'hover:bg-[color-mix(in_oklab,var(--linear-row-selected)_28%,var(--linear-bg-surface-0))]',
        ].join(' ');
      }

      return [
        'rounded-[10px] transition-[background-color,box-shadow] duration-150 ease-out cursor-pointer',
        'bg-transparent',
        'hover:bg-[color-mix(in_oklab,var(--linear-row-hover)_78%,transparent)]',
        'hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--linear-app-frame-seam)_72%,transparent)]',
        '[&:hover_span]:text-primary-token',
      ].join(' ');
    },
    [selectedMatchId]
  );

  return (
    <UnifiedTable
      data={items}
      columns={columns}
      onRowClick={onRowSelect}
      getRowId={getRowId}
      getRowTestId={getRowTestId}
      getRowClassName={getRowClassName}
      hideHeader
      enableVirtualization={false}
      rowHeight={44}
      minWidth='720px'
      className='text-[12.5px] text-primary-token'
      containerClassName='h-full px-2.5 pb-2.5 pt-0.5 md:px-3 md:pb-3 md:pt-1'
    />
  );
}
