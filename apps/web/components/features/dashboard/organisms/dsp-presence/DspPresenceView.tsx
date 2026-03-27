'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DspPresenceData,
  DspPresenceItem,
} from '@/app/app/(shell)/dashboard/presence/actions';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { UnifiedTable } from '@/components/organisms/table';
import { ConfidenceBadge } from '@/features/dashboard/atoms/ConfidenceBadge';
import {
  DspProviderIcon,
  PROVIDER_LABELS,
} from '@/features/dashboard/atoms/DspProviderIcon';
import { MatchStatusBadge } from '@/features/dashboard/atoms/MatchStatusBadge';
import { SIDEBAR_WIDTH, TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import { isExternalDspImage } from '@/lib/utils/dsp-images';
import { DspPresenceEmptyState } from './DspPresenceEmptyState';
import { DspPresenceSidebar } from './DspPresenceSidebar';
import { DspPresenceSummary } from './DspPresenceSummary';

// ============================================================================
// Column definitions
// ============================================================================

const columnHelper = createColumnHelper<DspPresenceItem>();

function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>) {
  e.stopPropagation();
}

function createPresenceColumns() {
  // TanStack Table requires ColumnDef<T, unknown>[] but mixed accessor types
  // produce incompatible unions. Cast at the call site via useMemo instead.
  return [
    // Artist column (primary anchor)
    columnHelper.display({
      id: 'artist',
      header: 'Artist',
      cell: ({ row }) => {
        const item = row.original;
        const label = PROVIDER_LABELS[item.providerId];
        return (
          <div className='flex min-w-0 items-center gap-2'>
            {item.externalArtistImageUrl ? (
              <div className='relative h-6 w-6 shrink-0 overflow-hidden rounded-full border border-subtle bg-(--linear-bg-surface-0)'>
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
              <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-subtle bg-(--linear-bg-surface-0)'>
                <DspProviderIcon provider={item.providerId} size='sm' />
              </div>
            )}
            <span className='min-w-0 flex-1 truncate font-[510] text-primary-token'>
              {item.externalArtistName ?? 'Unknown Artist'}
            </span>
          </div>
        );
      },
      size: 200,
      enableSorting: false,
    }),

    // Platform column
    columnHelper.accessor('providerId', {
      id: 'platform',
      header: 'Platform',
      cell: ({ row }) => {
        const item = row.original;
        const label = PROVIDER_LABELS[item.providerId];
        return (
          <div className='flex min-w-0 items-center gap-1.5 text-secondary-token'>
            <DspProviderIcon provider={item.providerId} size='sm' />
            <span className='min-w-0 flex-1 truncate'>{label}</span>
          </div>
        );
      },
      size: 140,
      enableSorting: false,
    }),

    // Status column
    columnHelper.accessor('status', {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <MatchStatusBadge status={row.original.status} size='sm' />
      ),
      size: 120,
      enableSorting: false,
    }),

    // Confidence column (only for confirmed/auto_confirmed)
    columnHelper.accessor('confidenceScore', {
      id: 'confidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const item = row.original;
        const isConfirmed =
          item.status === 'confirmed' || item.status === 'auto_confirmed';
        if (!isConfirmed) {
          return <span className='text-tertiary-token'>—</span>;
        }
        return <ConfidenceBadge score={item.confidenceScore} size='sm' />;
      },
      size: 100,
      enableSorting: false,
    }),

    // ISRCs column
    columnHelper.accessor('matchingIsrcCount', {
      id: 'isrcs',
      header: 'ISRCs',
      cell: ({ row }) => {
        const count = row.original.matchingIsrcCount;
        if (count === 0) {
          return <span className='text-tertiary-token'>—</span>;
        }
        return <span className='text-secondary-token'>{count}</span>;
      },
      size: 80,
      enableSorting: false,
    }),

    // External link column
    columnHelper.display({
      id: 'link',
      header: () => <span className='sr-only'>External link</span>,
      cell: ({ row }) => {
        const url = row.original.externalArtistUrl;
        if (!url) return null;
        return (
          <div className='flex items-center justify-end'>
            <a
              href={url}
              target='_blank'
              rel='noopener noreferrer'
              onClick={handleLinkClick}
              className='flex h-6 w-6 items-center justify-center rounded text-tertiary-token transition-colors hover:text-primary-token'
              aria-label={`View ${row.original.externalArtistName ?? 'artist'} on ${PROVIDER_LABELS[row.original.providerId]}`}
            >
              <ExternalLink className='h-3.5 w-3.5' />
            </a>
          </div>
        );
      },
      size: 48,
      enableSorting: false,
    }),
  ];
}

// ============================================================================
// View component
// ============================================================================

interface DspPresenceViewProps {
  readonly data: DspPresenceData;
}

export function DspPresenceView({ data }: DspPresenceViewProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const selectedItem =
    data.items.find(i => i.matchId === selectedMatchId) ?? null;
  const isSidebarOpen = selectedItem !== null;

  // Clear stale selection when item disappears from data (e.g. after reject)
  useEffect(() => {
    if (selectedMatchId && !selectedItem) {
      setSelectedMatchId(null);
    }
  }, [selectedMatchId, selectedItem]);

  // Column definitions (stable reference)
  const columns = useMemo(
    () => createPresenceColumns() as ColumnDef<DspPresenceItem, unknown>[],
    []
  );

  // Shell integration: drawer toggle + right panel width
  const { setTableMeta } = useTableMeta();
  const itemsRef = useRef(data.items);
  itemsRef.current = data.items;

  useEffect(() => {
    const toggle = () => {
      if (isSidebarOpen) {
        setSelectedMatchId(null);
      } else if (itemsRef.current.length > 0) {
        setSelectedMatchId(itemsRef.current[0].matchId);
      }
    };

    setTableMeta({
      rowCount: data.items.length,
      toggle: data.items.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
    });

    return () => {
      setTableMeta({
        rowCount: 0,
        toggle: null,
        rightPanelWidth: 0,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [selectedMatchId, data.items.length, isSidebarOpen]);

  // Row click: toggle sidebar
  const handleRowClick = useCallback(
    (item: DspPresenceItem) => {
      setSelectedMatchId(
        item.matchId === selectedMatchId ? null : item.matchId
      );
    },
    [selectedMatchId]
  );

  // Keyboard nav: only update selection when sidebar is already open.
  // Sorting is disabled on all columns (sort order is server-side in actions.ts),
  // so data.items index matches the visual row index.
  const handleFocusedRowChange = useCallback(
    (index: number) => {
      if (isSidebarOpen && data.items[index]) {
        setSelectedMatchId(data.items[index].matchId);
      }
    },
    [isSidebarOpen, data.items]
  );

  // Selected row highlight
  const getRowClassName = useCallback(
    (item: DspPresenceItem) => {
      return selectedMatchId === item.matchId ? 'bg-white/[0.04]' : '';
    },
    [selectedMatchId]
  );

  // Row test IDs (replaces presence-card- testids).
  // Uses matchId for uniqueness since multiple matches can exist per provider.
  const getRowTestId = useCallback(
    (item: DspPresenceItem) => `presence-row-${item.matchId}`,
    []
  );

  if (data.items.length === 0) {
    return <DspPresenceEmptyState />;
  }

  return (
    <div className='flex h-full min-h-0 flex-row bg-[color-mix(in_oklab,var(--linear-bg-page)_72%,var(--linear-bg-surface-1))]'>
      {/* Main content */}
      <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
        <DspPresenceSummary
          confirmedCount={data.confirmedCount}
          suggestedCount={data.suggestedCount}
        />

        <div className='flex-1 min-h-0 overflow-auto'>
          <UnifiedTable<DspPresenceItem>
            data={data.items}
            columns={columns}
            getRowId={item => item.matchId}
            onRowClick={handleRowClick}
            onFocusedRowChange={handleFocusedRowChange}
            getRowClassName={getRowClassName}
            getRowTestId={getRowTestId}
            enableVirtualization={false}
            minWidth={`${TABLE_MIN_WIDTHS.SMALL}px`}
            skeletonRows={8}
          />
        </div>
      </div>

      {/* Detail sidebar */}
      <DspPresenceSidebar
        item={selectedItem}
        onClose={() => setSelectedMatchId(null)}
      />
    </div>
  );
}
