'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  type ColumnDef,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Copy,
  Disc3,
  ExternalLink,
  FileAudio2,
  FileText,
  Filter,
  Grid3x3,
  ImageIcon,
  LayoutList,
  type LucideIcon,
  Music2,
  Pause,
  PlayCircle,
  Share2,
  Shirt,
  Table2,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type CSSProperties,
  cloneElement,
  createContext,
  type MouseEvent,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { LibraryAssetSharePanel } from '@/components/features/library-asset-share/LibraryAssetSharePanel';
import { LibraryAssetShareUrlCell } from '@/components/features/library-asset-share/LibraryAssetShareUrlCell';
import { LibraryShareDropCreator } from '@/components/features/library-share/LibraryShareDropCreator';
import { ReleaseAudioAssetPanel } from '@/components/features/release/ReleaseAudioAssetPanel';
import { toast } from '@/components/feedback';
import { AppSearchField } from '@/components/molecules/AppSearchField';
import {
  DrawerHeader,
  DrawerSection,
  DrawerSectionGroup,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import {
  type DrawerHeaderAction,
  DrawerHeaderActions,
} from '@/components/molecules/drawer-header/DrawerHeaderActions';
import {
  TOOLBAR_MENU_CONTENT_CLASS,
  ToolbarMenuChoiceItem,
} from '@/components/molecules/menus/ToolbarMenuPrimitives';
import { PageShell } from '@/components/organisms/PageShell';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  TableEmptyState,
  UnifiedTable,
  UnifiedTableSkeleton,
} from '@/components/organisms/table';
import {
  type ContextMenuItemType,
  TableContextMenu,
} from '@/components/organisms/table/molecules/TableContextMenu';
import {
  type DspAvatarItem,
  DspAvatarStack,
} from '@/components/shell/DspAvatarStack';
import type { FilterPill } from '@/components/shell/pill-search.types';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterHeaderSearch } from '@/contexts/HeaderActionsContext';
import { useRegisterShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import {
  formatLibraryApprovalStatus,
  LIBRARY_APPROVAL_STATUSES,
  type LibraryApprovalStatus,
  libraryApprovalStatusClasses,
  libraryApprovalStatusDotClasses,
} from '@/lib/library/approval-status';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import {
  releaseStatusClasses,
  releaseStatusDotClasses,
} from '@/lib/library/release-status';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import { LibraryMediaThumbnail } from './LibraryMediaThumbnail';
import {
  formatLibraryDuration,
  formatLibraryReleaseDate,
  getLibraryAspectRatioClass,
  getLibraryAssetAspectRatio,
  getLibraryDrawerHeroClass,
  getLibraryItemKind,
  LIBRARY_GRID_DENSITY_LAYOUT,
  type LibraryAssetKind,
  type LibraryGridDensity,
  type LibraryReleaseAsset,
  type LibraryView,
  type LibraryViewMode,
  libraryAssetMatchesView,
  stackLibraryReleaseVersions,
} from './library-data';
import {
  LIBRARY_GRID_DENSITY_OPTIONS,
  useLibraryGridDensity,
  useLibraryViewMode,
} from './library-grid-preferences';
import {
  countLibrarySavedViewMatches,
  getLibrarySavedViewPredicate,
  LIBRARY_SAVED_VIEWS,
  type LibrarySavedViewId,
  persistLibrarySavedView,
  readPersistedLibrarySavedView,
} from './library-saved-views';

const LIBRARY_TABLE_ROW_HEIGHT = 56;
const LIBRARY_TABLE_MIN_WIDTH = '0';
const LIBRARY_CONTENT_INSET_CLASS =
  'px-(--linear-app-header-padding-x) py-(--linear-app-content-padding-y)';
const LIBRARY_CARD_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none';
const LIBRARY_BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none';
const LIBRARY_TABLE_SKELETON_CONFIG: Array<{
  readonly width?: string;
  readonly variant?:
    | 'text'
    | 'avatar'
    | 'badge'
    | 'button'
    | 'release'
    | 'meta';
}> = [
  { variant: 'release', width: '100%' },
  { variant: 'badge', width: '108px' },
  { variant: 'badge', width: '92px' },
  { variant: 'text', width: '88px' },
  { variant: 'meta', width: '72px' },
  { variant: 'text', width: '96px' },
];

type LibrarySortKey = 'releaseDate' | 'title' | 'status' | 'providers';
type LibraryPresetId = LibraryView;
type LibraryPreviewToggle = (
  asset: LibraryReleaseAsset,
  event?: MouseEvent<HTMLElement>
) => void;
type LibraryContextMenuBuilder = (
  asset: LibraryReleaseAsset
) => ContextMenuItemType[];
const noopPreviewToggle: LibraryPreviewToggle = () => undefined;
const LibraryPreviewContext = createContext<{
  readonly playingPreviewId: string | null;
  readonly onTogglePreview: LibraryPreviewToggle;
}>({
  playingPreviewId: null,
  onTogglePreview: noopPreviewToggle,
});

type LibraryFilters = {
  readonly statuses: Set<LibraryReleaseAsset['status']>;
  readonly releaseTypes: Set<LibraryReleaseAsset['releaseType']>;
  readonly assetKinds: Set<LibraryAssetKind>;
  readonly providers: Set<string>;
};

type CountMap<T extends string> = ReadonlyMap<T, number>;

const ASSET_KIND_LABELS: Record<LibraryAssetKind, string> = {
  artwork: 'Artwork',
  preview: 'Preview',
  lyrics: 'Lyrics',
  providers: 'Providers',
  video: 'Video',
};

const ASSET_KIND_ICONS: Record<LibraryAssetKind, LucideIcon> = {
  artwork: ImageIcon,
  preview: FileAudio2,
  lyrics: FileText,
  providers: Music2,
  video: Video,
};

const SORT_LABELS: Record<LibrarySortKey, string> = {
  releaseDate: 'Release Date',
  title: 'Title',
  status: 'Status',
  providers: 'Providers',
};

const PRESETS: readonly {
  readonly id: LibraryPresetId;
  readonly label: string;
  readonly description: string;
  readonly predicate: (asset: LibraryReleaseAsset) => boolean;
}[] = [
  {
    id: 'all',
    label: 'All',
    description: 'Releases, merch, images, videos, and audio',
    predicate: () => true,
  },
  {
    id: 'releases',
    label: 'Releases',
    description: 'Music catalog and provider assets',
    predicate: asset => libraryAssetMatchesView(asset, 'releases'),
  },
  {
    id: 'merch',
    label: 'Merch',
    description: 'Draft, paused, and live merch cards',
    predicate: asset => libraryAssetMatchesView(asset, 'merch'),
  },
  {
    id: 'images',
    label: 'Images',
    description: 'Artwork and merch mockups',
    predicate: asset => libraryAssetMatchesView(asset, 'images'),
  },
  {
    id: 'videos',
    label: 'Videos',
    description: 'Video assets and links',
    predicate: asset => libraryAssetMatchesView(asset, 'videos'),
  },
  {
    id: 'audio',
    label: 'Audio',
    description: 'Playable previews',
    predicate: asset => libraryAssetMatchesView(asset, 'audio'),
  },
];

function emptyFilters(): LibraryFilters {
  return {
    statuses: new Set(),
    releaseTypes: new Set(),
    assetKinds: new Set(),
    providers: new Set(),
  };
}

function parseLibraryViewParam(value: string | null): LibraryPresetId {
  return PRESETS.some(preset => preset.id === value)
    ? (value as LibraryPresetId)
    : 'all';
}

function toggleSet<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function formatReleaseType(type: LibraryReleaseAsset['releaseType']): string {
  return type.split('_').map(capitalizeFirst).join(' ');
}

function formatLibraryItemType(asset: LibraryReleaseAsset): string {
  if (getLibraryItemKind(asset) === 'merch') {
    return asset.productType?.trim() || 'Merch';
  }
  return formatReleaseType(asset.releaseType);
}

function formatReleaseStatus(status: LibraryReleaseAsset['status']): string {
  return capitalizeFirst(status);
}

function formatLibraryStatus(asset: LibraryReleaseAsset): string {
  return asset.itemStatusLabel ?? formatReleaseStatus(asset.status);
}

function assetMatchesFilters(
  asset: LibraryReleaseAsset,
  filters: LibraryFilters
): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(asset.status)) {
    return false;
  }
  if (
    filters.releaseTypes.size > 0 &&
    !filters.releaseTypes.has(asset.releaseType)
  ) {
    return false;
  }
  if (
    filters.assetKinds.size > 0 &&
    !asset.assetKinds.some(kind => filters.assetKinds.has(kind))
  ) {
    return false;
  }
  if (
    filters.providers.size > 0 &&
    !asset.providers.some(provider => filters.providers.has(provider.key))
  ) {
    return false;
  }
  return true;
}

function normalizePillValue(value: string): string {
  return value.trim().toLowerCase();
}

function valuesMatchPill(values: readonly string[], pill: FilterPill): boolean {
  const normalizedValues = new Set(values.map(normalizePillValue));
  const normalizedPillValues = pill.values.map(normalizePillValue);
  const hasAny = normalizedPillValues.some(value =>
    normalizedValues.has(value)
  );

  return pill.op === 'is' ? hasAny : !hasAny;
}

function assetMatchesPills(
  asset: LibraryReleaseAsset,
  pills: readonly FilterPill[]
): boolean {
  if (pills.length === 0) return true;

  return pills.every(pill => {
    switch (pill.field) {
      case 'artist':
        return valuesMatchPill([asset.artist], pill);
      case 'title':
        return valuesMatchPill([asset.title], pill);
      case 'status':
        return valuesMatchPill([asset.status], pill);
      case 'approval':
        return valuesMatchPill([asset.approvalStatus], pill);
      case 'has':
        return valuesMatchPill(asset.assetKinds, pill);
      case 'album':
        return true;
    }
  });
}

function hasActiveFilters(filters: LibraryFilters): boolean {
  return (
    filters.statuses.size +
      filters.releaseTypes.size +
      filters.assetKinds.size +
      filters.providers.size >
    0
  );
}

function releaseDateTime(asset: LibraryReleaseAsset): number {
  if (!asset.releaseDate) return 0;
  const date = new Date(asset.releaseDate);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function compareAssets(sort: LibrarySortKey) {
  return (a: LibraryReleaseAsset, b: LibraryReleaseAsset) => {
    if (sort === 'releaseDate') return releaseDateTime(b) - releaseDateTime(a);
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'status') return a.status.localeCompare(b.status);
    return b.providerCount - a.providerCount;
  };
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function countBy<T extends string>(
  assets: readonly LibraryReleaseAsset[],
  getValues: (asset: LibraryReleaseAsset) => readonly T[]
): CountMap<T> {
  const counts = new Map<T, number>();
  for (const asset of assets) {
    for (const value of getValues(asset)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function formatCompactCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

const ReleaseCell = memo(function ReleaseCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  const { playingPreviewId, onTogglePreview } = useContext(
    LibraryPreviewContext
  );
  const hasPreview = Boolean(asset.previewUrl);
  const isPreviewPlaying = playingPreviewId === asset.id;

  return (
    <div className='flex min-w-0 items-center gap-2.5'>
      <span className='system-b-library-artwork-shell group/artwork relative h-10 w-10 shrink-0 overflow-hidden'>
        <LibraryMediaThumbnail asset={asset} size='row' />
        {hasPreview ? (
          <button
            type='button'
            onClick={event => onTogglePreview(asset, event)}
            onKeyDown={event => event.stopPropagation()}
            aria-label={
              isPreviewPlaying
                ? `Pause Preview for ${asset.title}`
                : `Play Preview for ${asset.title}`
            }
            aria-pressed={isPreviewPlaying}
            data-testid={`library-preview-row-${asset.id}`}
            className={cn(
              'system-b-library-preview-overlay absolute inset-0 grid place-items-center transition-opacity duration-subtle ease-subtle focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55',
              isPreviewPlaying
                ? 'opacity-100'
                : 'opacity-0 group-hover/artwork:opacity-100'
            )}
          >
            {isPreviewPlaying ? (
              <Pause className='h-3.5 w-3.5' strokeWidth={2.5} />
            ) : (
              <PlayCircle className='h-3.5 w-3.5' strokeWidth={2.25} />
            )}
          </button>
        ) : null}
      </span>
      <span className='min-w-0'>
        <span className='system-b-library-release-title block truncate'>
          {asset.title}
        </span>
        <span className='system-b-library-release-meta mt-0.5 block truncate'>
          {asset.artist}
        </span>
      </span>
    </div>
  );
});

const StatusCell = memo(function StatusCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span
      role='status'
      className={cn(
        'system-b-library-status-pill inline-flex h-6 w-fit items-center border px-2 leading-4',
        releaseStatusClasses(asset.status)
      )}
      data-testid={`library-release-status-${asset.id}`}
      aria-label={`Release Status: ${formatLibraryStatus(asset)}`}
    >
      {formatLibraryStatus(asset)}
    </span>
  );
});

/**
 * Approval Status stays out of the library rail/columns until a real review
 * workflow exists (JOV-3089) — one visible status vocabulary: release status.
 */
function assetMatchesSearchQuery(
  asset: LibraryReleaseAsset,
  normalizedQuery: string
): boolean {
  if (!normalizedQuery) return true;
  return (
    asset.title.toLowerCase().includes(normalizedQuery) ||
    asset.artist.toLowerCase().includes(normalizedQuery)
  );
}

/**
 * Neutral fallback avatar color for provider keys missing from
 * `PROVIDER_CONFIG`. Points at a System B text token — no raw hex here.
 */
const LIBRARY_DSP_FALLBACK_COLOR = 'var(--linear-text-quaternary)';

/**
 * Map a library asset's provider links -> `DspAvatarItem[]` for the stacked
 * provider-logo affordance. Every link present on the asset renders `live`;
 * brand color + label come from the canonical `PROVIDER_CONFIG`.
 */
function libraryProvidersToDspItems(
  providers: LibraryReleaseAsset['providers']
): DspAvatarItem[] {
  return providers.map(provider => {
    const config = PROVIDER_CONFIG[provider.key];
    const label = config?.label ?? provider.label;
    return {
      id: provider.key,
      label,
      glyph: label.charAt(0).toUpperCase(),
      color: config?.accent ?? LIBRARY_DSP_FALLBACK_COLOR,
      status: 'live' as const,
    };
  });
}

const ProvidersCell = memo(function ProvidersCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  const items = libraryProvidersToDspItems(asset.providers);

  if (items.length === 0) {
    return (
      <span
        role='img'
        aria-label='No Providers'
        className='system-b-library-meta-text text-quaternary-token'
      >
        &mdash;
      </span>
    );
  }

  return <DspAvatarStack dsps={items} maxVisible={3} />;
});

const CatalogArtworkCell = memo(function CatalogArtworkCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span className='system-b-library-artwork-shell relative block h-9 w-9 overflow-hidden'>
      <LibraryMediaThumbnail asset={asset} size='row' />
    </span>
  );
});

const libraryColumnHelper = createColumnHelper<LibraryReleaseAsset>();

function createLibraryTypeColumn(
  metaClassName: string,
  size: number,
  minSize: number
) {
  return libraryColumnHelper.display({
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text truncate text-tertiary-token'>
        {formatLibraryItemType(row.original)}
      </span>
    ),
    size,
    minSize,
    meta: { className: metaClassName },
  });
}

// Slice 1 minimal catalog column set: status · artwork · title · artist · type.
// Slice 2/3 adds BPM/key/energy/rating/waveform/DSP columns + the Tracks fold-in.
const LIBRARY_CATALOG_COLUMNS = [
  libraryColumnHelper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusCell asset={row.original} />,
    size: 112,
    minSize: 96,
    meta: { className: 'pl-2.5 pr-2' },
  }),
  libraryColumnHelper.display({
    id: 'artwork',
    header: 'Artwork',
    cell: ({ row }) => <CatalogArtworkCell asset={row.original} />,
    size: 56,
    minSize: 56,
    enableSorting: false,
    meta: { className: 'px-2' },
  }),
  libraryColumnHelper.accessor('title', {
    id: 'title',
    header: 'Title',
    cell: ({ row }) => (
      <span className='system-b-library-release-title block truncate'>
        {row.original.title}
      </span>
    ),
    minSize: 180,
    size: 9999,
    enableSorting: false,
    meta: { className: 'px-2' },
  }),
  libraryColumnHelper.accessor('artist', {
    id: 'artist',
    header: 'Artist',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text block truncate text-tertiary-token'>
        {row.original.artist}
      </span>
    ),
    size: 160,
    minSize: 120,
    enableSorting: false,
    meta: { className: 'hidden md:table-cell px-2' },
  }),
  createLibraryTypeColumn('hidden sm:table-cell pl-2 pr-3', 120, 96),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

const LIBRARY_TABLE_COLUMNS = [
  libraryColumnHelper.accessor('title', {
    id: 'release',
    header: 'Item',
    cell: ({ row }) => <ReleaseCell asset={row.original} />,
    minSize: 220,
    size: 9999,
    enableSorting: false,
    meta: { className: 'pl-2.5 pr-2' },
  }),
  libraryColumnHelper.display({
    id: 'status',
    header: 'Release',
    cell: ({ row }) => <StatusCell asset={row.original} />,
    size: 112,
    minSize: 96,
    meta: { className: 'hidden xl:table-cell px-2' },
  }),
  createLibraryTypeColumn('hidden lg:table-cell px-2', 104, 88),
  libraryColumnHelper.display({
    id: 'providers',
    header: 'Providers',
    cell: ({ row }) => <ProvidersCell asset={row.original} />,
    size: 120,
    minSize: 96,
    meta: { className: 'hidden md:table-cell px-2' },
  }),
  libraryColumnHelper.display({
    id: 'shareUrl',
    header: 'Share URL',
    cell: ({ row }) => (
      <LibraryAssetShareUrlCell
        asset={row.original}
        share={row.original.share}
      />
    ),
    size: 220,
    minSize: 180,
    enableSorting: false,
    meta: { className: 'hidden lg:table-cell px-2' },
  }),
  libraryColumnHelper.display({
    id: 'releaseDate',
    header: 'Release Date',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text block whitespace-nowrap text-right tabular-nums text-tertiary-token'>
        {row.original.releaseDate
          ? formatLibraryReleaseDate(row.original.releaseDate)
          : 'No date'}
      </span>
    ),
    size: 112,
    minSize: 96,
    meta: { className: 'hidden sm:table-cell pl-2 pr-3' },
  }),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

const LIBRARY_VIEW_FILTER_CHIP_KEYS = PRESETS.map(preset => preset.id);

export function LibraryLoadingState() {
  return (
    <PageShell
      aria-busy='true'
      aria-label='Loading Library'
      frame='content-container'
      contentPadding='none'
      data-testid='library-surface-loading'
      toolbar={
        <PageToolbar
          start={
            <div
              className='flex min-w-0 flex-wrap items-center gap-1'
              data-testid='library-view-filter-chips'
            >
              {LIBRARY_VIEW_FILTER_CHIP_KEYS.map(key => (
                <span
                  key={key}
                  className='inline-block h-7 w-16 rounded-full skeleton motion-reduce:animate-none'
                  aria-hidden='true'
                />
              ))}
            </div>
          }
        />
      }
    >
      <UnifiedTableSkeleton<LibraryReleaseAsset>
        columns={LIBRARY_TABLE_COLUMNS}
        hideHeader
        rowHeight={LIBRARY_TABLE_ROW_HEIGHT}
        minWidth={LIBRARY_TABLE_MIN_WIDTH}
        skeletonRows={SKELETON_ROW_COUNT.TABLE}
        skeletonColumnConfig={LIBRARY_TABLE_SKELETON_CONFIG}
        containerClassName={cn('h-full', LIBRARY_CONTENT_INSET_CLASS)}
      />
    </PageShell>
  );
}

function LibraryViewFilterChip({
  label,
  count,
  active,
  onClick,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'system-b-library-filter-pill h-7 rounded-full px-3 font-caption transition-colors duration-subtle ease-subtle',
        active
          ? 'system-b-library-filter-pill-active'
          : 'system-b-library-filter-pill-idle'
      )}
    >
      {label}
      <span className='system-b-library-rail-count ml-1 tabular-nums'>
        {count}
      </span>
    </button>
  );
}

function LibraryViewFilterChips({
  assets,
  preset,
  onPreset,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly preset: LibraryPresetId;
  readonly onPreset: (preset: LibraryPresetId) => void;
}) {
  return (
    <div
      className='flex min-w-0 flex-wrap items-center gap-1'
      data-testid='library-view-filter-chips'
    >
      {PRESETS.map(view => (
        <LibraryViewFilterChip
          key={view.id}
          label={view.label}
          count={assets.filter(view.predicate).length}
          active={preset === view.id}
          onClick={() => onPreset(view.id)}
        />
      ))}
    </div>
  );
}

function LibrarySavedViewRow({
  label,
  count,
  active,
  onClick,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button
      asChild
      variant={active ? 'secondary' : 'tertiary'}
      size='sm'
      static
      className={cn(
        'flex h-7 w-full items-center justify-start gap-2 border px-2 transition-colors duration-fast ease-subtle focus-visible:ring-offset-(--linear-app-content-surface)',
        active
          ? 'border-default bg-surface-1 text-primary-token'
          : 'border-transparent text-secondary-token hover:border-default hover:bg-surface-1 hover:text-primary-token'
      )}
    >
      <button type='button' onClick={onClick} aria-pressed={active}>
        <span className='min-w-0 flex-1 truncate text-left'>
          {label || 'Untitled'}
        </span>
        <span className='system-b-library-rail-count tabular-nums'>
          {count}
        </span>
      </button>
    </Button>
  );
}

function LibraryRail({
  assets,
  savedView,
  onSavedView,
  filters,
  onFilters,
  onClearFilters,
  className,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly savedView: LibrarySavedViewId;
  readonly onSavedView: (savedView: LibrarySavedViewId) => void;
  readonly filters: LibraryFilters;
  readonly onFilters: (filters: LibraryFilters) => void;
  readonly onClearFilters: () => void;
  readonly className?: string;
}) {
  const releaseTypes = uniqueSorted(assets.map(asset => asset.releaseType));
  const statuses = uniqueSorted(assets.map(asset => asset.status));
  const providerKeys = uniqueSorted(
    assets.flatMap(asset => asset.providers.map(provider => provider.key))
  );
  const providerLabels = new Map(
    assets.flatMap(asset =>
      asset.providers.map(provider => [provider.key, provider.label] as const)
    )
  );
  const assetKinds = (
    uniqueSorted(
      assets.flatMap(asset => asset.assetKinds)
    ) as LibraryAssetKind[]
  ).filter(kind => kind !== 'providers' || providerKeys.length === 0);
  const counts = {
    releaseTypes: countBy(assets, asset => [asset.releaseType]),
    statuses: countBy(assets, asset => [asset.status]),
    providers: countBy(
      assets,
      asset => asset.providers.map(provider => provider.key) as string[]
    ),
    assetKinds: countBy(assets, asset => asset.assetKinds),
  };
  const activeFilterCount =
    filters.statuses.size +
    filters.releaseTypes.size +
    filters.assetKinds.size +
    filters.providers.size;

  return (
    <nav
      aria-label='Library Filters'
      className={cn(
        'system-b-library-rail flex min-h-0 flex-col p-2.5',
        className
      )}
    >
      <div className='min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='pb-2'>
          <p className='system-b-library-rail-title pb-1 pt-2'>Smart Filters</p>
          <div className='space-y-px' data-testid='library-saved-filter-views'>
            {LIBRARY_SAVED_VIEWS.map(view => (
              <LibrarySavedViewRow
                key={view.id}
                label={view.label}
                count={countLibrarySavedViewMatches(assets, view.id)}
                active={savedView === view.id}
                onClick={() => onSavedView(view.id)}
              />
            ))}
          </div>
        </div>

        <div className='flex items-center justify-between gap-2 border-t border-subtle pb-1 pt-2'>
          <p className='system-b-library-rail-title'>Filters</p>
          {hasActiveFilters(filters) ? (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              onClick={onClearFilters}
              className='h-auto rounded-xs px-1.5 py-0.5 text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
            >
              Clear Filters ({activeFilterCount})
            </Button>
          ) : null}
        </div>

        <FilterSection label='Release Status'>
          {statuses.map(status => (
            <FilterRow
              key={status}
              active={filters.statuses.has(status)}
              count={counts.statuses.get(status) ?? 0}
              label={formatReleaseStatus(status)}
              dotClassName={releaseStatusDotClasses(status)}
              onClick={() =>
                onFilters({
                  ...filters,
                  statuses: toggleSet(filters.statuses, status),
                })
              }
            />
          ))}
        </FilterSection>

        <FilterSection label='Type'>
          {releaseTypes.map(type => (
            <FilterRow
              key={type}
              active={filters.releaseTypes.has(type)}
              count={counts.releaseTypes.get(type) ?? 0}
              icon={Disc3}
              label={formatReleaseType(type)}
              onClick={() =>
                onFilters({
                  ...filters,
                  releaseTypes: toggleSet(filters.releaseTypes, type),
                })
              }
            />
          ))}
        </FilterSection>

        <FilterSection label='Assets'>
          {assetKinds.map(kind => (
            <FilterRow
              key={kind}
              active={filters.assetKinds.has(kind)}
              count={counts.assetKinds.get(kind) ?? 0}
              icon={ASSET_KIND_ICONS[kind]}
              label={ASSET_KIND_LABELS[kind]}
              onClick={() =>
                onFilters({
                  ...filters,
                  assetKinds: toggleSet(filters.assetKinds, kind),
                })
              }
            />
          ))}
        </FilterSection>

        {providerKeys.length > 0 ? (
          <FilterSection label='Providers'>
            {providerKeys.map(key => (
              <FilterRow
                key={key}
                active={filters.providers.has(key)}
                count={counts.providers.get(key) ?? 0}
                leadingIcon={
                  <ProviderIcon
                    provider={key as ProviderKey}
                    className='h-3 w-3'
                  />
                }
                label={providerLabels.get(key) ?? capitalizeFirst(key)}
                onClick={() =>
                  onFilters({
                    ...filters,
                    providers: toggleSet(filters.providers, key),
                  })
                }
              />
            ))}
          </FilterSection>
        ) : null}
      </div>
    </nav>
  );
}

function FilterSection({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const disclosureId = useId();
  const buttonId = `${disclosureId}-button`;
  const panelId = `${disclosureId}-panel`;

  return (
    <div className='pt-2'>
      <Button
        asChild
        variant='tertiary'
        size='sm'
        static
        className='flex h-6 w-full items-center justify-between px-1 font-medium text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
      >
        <button
          id={buttonId}
          type='button'
          aria-controls={panelId}
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
        >
          <span>{label}</span>
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform duration-subtle ease-subtle',
              !open && '-rotate-90'
            )}
            aria-hidden='true'
          />
        </button>
      </Button>
      {open ? (
        <section
          id={panelId}
          aria-labelledby={buttonId}
          className='space-y-px pt-0.5'
        >
          {children}
        </section>
      ) : null}
    </div>
  );
}

function FilterRow({
  label,
  count,
  active,
  onClick,
  icon: Icon,
  leadingIcon,
  dotClassName,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon?: LucideIcon;
  readonly leadingIcon?: ReactNode;
  readonly dotClassName?: string;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'system-b-library-filter-row flex h-7 w-full items-center gap-2 border px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none',
        active && 'system-b-library-filter-row--active'
      )}
    >
      {leadingIcon ? (
        <span className='grid h-3 w-3 shrink-0 place-items-center'>
          {leadingIcon}
        </span>
      ) : Icon ? (
        <Icon className='h-3 w-3 shrink-0 text-tertiary-token' />
      ) : (
        <span
          className={cn(
            'system-b-library-filter-dot h-1.5 w-1.5 shrink-0',
            dotClassName
          )}
          aria-hidden='true'
        />
      )}
      <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
      <span className='system-b-library-filter-count tabular-nums'>
        {count}
      </span>
      {active ? (
        <Check className='h-3 w-3 shrink-0 text-primary-token' />
      ) : null}
    </button>
  );
}

function SortDropdown({
  sort,
  onSort,
}: {
  readonly sort: LibrarySortKey;
  readonly onSort: (sort: LibrarySortKey) => void;
}) {
  return (
    <ShellDropdown
      align='end'
      side='bottom'
      sideOffset={6}
      width={184}
      trigger={
        <button type='button' className={PAGE_TOOLBAR_MENU_TRIGGER_CLASS}>
          <ArrowUpDown className={PAGE_TOOLBAR_ICON_CLASS} strokeWidth={2.25} />
          <span className='hidden sm:inline'>{SORT_LABELS[sort]}</span>
          <ChevronDown className='h-3 w-3' strokeWidth={2.25} />
        </button>
      }
    >
      <ShellDropdown.Label>Sort By</ShellDropdown.Label>
      <ShellDropdown.RadioGroup
        value={sort}
        onValueChange={value => onSort(value as LibrarySortKey)}
      >
        {(Object.keys(SORT_LABELS) as LibrarySortKey[]).map(key => (
          <ShellDropdown.RadioItem
            key={key}
            value={key}
            label={SORT_LABELS[key]}
          />
        ))}
      </ShellDropdown.RadioGroup>
    </ShellDropdown>
  );
}

function ViewToggle({
  view,
  onView,
}: {
  readonly view: LibraryViewMode;
  readonly onView: (view: LibraryViewMode) => void;
}) {
  return (
    <div className={cn(PAGE_TOOLBAR_END_GROUP_CLASS, 'ml-0 gap-0.5')}>
      <PageToolbarActionButton
        label='Grid View'
        icon={<Grid3x3 className={PAGE_TOOLBAR_ICON_CLASS} />}
        active={view === 'grid'}
        onClick={() => onView('grid')}
        iconOnly
        tooltipLabel='Grid View'
      />
      <PageToolbarActionButton
        label='List View'
        icon={<LayoutList className={PAGE_TOOLBAR_ICON_CLASS} />}
        active={view === 'list'}
        onClick={() => onView('list')}
        iconOnly
        tooltipLabel='List View'
      />
      <PageToolbarActionButton
        label='Table View'
        icon={<Table2 className={PAGE_TOOLBAR_ICON_CLASS} />}
        active={view === 'table'}
        onClick={() => onView('table')}
        iconOnly
        tooltipLabel='Table View'
      />
    </div>
  );
}

function GridDensityToggle({
  density,
  onDensity,
}: {
  readonly density: LibraryGridDensity;
  readonly onDensity: (density: LibraryGridDensity) => void;
}) {
  return (
    <fieldset
      className={cn(PAGE_TOOLBAR_END_GROUP_CLASS, 'ml-0 gap-0.5 border-0 p-0')}
      data-testid='library-grid-density-toggle'
      aria-label='Card Size'
    >
      {LIBRARY_GRID_DENSITY_OPTIONS.map(option => (
        <PageToolbarActionButton
          key={option.value}
          label={option.label}
          active={density === option.value}
          onClick={() => onDensity(option.value)}
          tooltipLabel={option.tooltip}
          ariaLabel={`${option.tooltip} card size`}
        />
      ))}
    </fieldset>
  );
}

function LibraryToolbar({
  assets,
  preset,
  onPreset,
  sort,
  onSort,
  view,
  onView,
  gridDensity,
  onGridDensity,
  searchQuery,
  onSearchQuery,
  visibleCount,
  totalCount,
  mobileFiltersOpen,
  onToggleMobileFilters,
  activeFilterCount,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly preset: LibraryPresetId;
  readonly onPreset: (preset: LibraryPresetId) => void;
  readonly sort: LibrarySortKey;
  readonly onSort: (sort: LibrarySortKey) => void;
  readonly view: LibraryViewMode;
  readonly onView: (view: LibraryViewMode) => void;
  readonly gridDensity: LibraryGridDensity;
  readonly onGridDensity: (density: LibraryGridDensity) => void;
  readonly searchQuery: string;
  readonly onSearchQuery: (query: string) => void;
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly mobileFiltersOpen: boolean;
  readonly onToggleMobileFilters: () => void;
  readonly activeFilterCount: number;
}) {
  return (
    <PageToolbar
      start={
        <div className='flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2'>
          <LibraryViewFilterChips
            assets={assets}
            preset={preset}
            onPreset={onPreset}
          />
          <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
            {visibleCount}
            {visibleCount === totalCount ? '' : ` of ${totalCount}`} visible
          </span>
        </div>
      }
      end={
        <>
          <AppSearchField
            value={searchQuery}
            onChange={onSearchQuery}
            placeholder='Search library'
            ariaLabel='Search library by title'
            className='w-36 sm:w-48'
          />
          <PageToolbarActionButton
            label={
              activeFilterCount > 0
                ? `Show Filters (${activeFilterCount})`
                : 'Show Filters'
            }
            icon={<Filter className={PAGE_TOOLBAR_ICON_CLASS} />}
            onClick={onToggleMobileFilters}
            aria-expanded={mobileFiltersOpen}
            ariaPressed={mobileFiltersOpen}
            tooltipLabel={mobileFiltersOpen ? 'Hide filters' : 'Show filters'}
            className='lg:hidden'
          />
          <SortDropdown sort={sort} onSort={onSort} />
          {view === 'grid' ? (
            <GridDensityToggle
              density={gridDensity}
              onDensity={onGridDensity}
            />
          ) : null}
          <ViewToggle view={view} onView={onView} />
        </>
      }
    />
  );
}

const AssetKindPill = memo(function AssetKindPill({
  kind,
}: {
  readonly kind: LibraryAssetKind;
}) {
  const Icon = ASSET_KIND_ICONS[kind];
  return (
    <span className='system-b-library-kind-pill inline-flex h-6 items-center gap-1 px-2'>
      <Icon className='h-3 w-3' strokeWidth={2.25} />
      {ASSET_KIND_LABELS[kind]}
    </span>
  );
});

const AssetCard = memo(function AssetCard({
  asset,
  selected,
  isPreviewActive,
  isPreviewPlaying,
  onSelect,
  onTogglePreview,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly selected: boolean;
  readonly isPreviewActive: boolean;
  readonly isPreviewPlaying: boolean;
  readonly onSelect: () => void;
  readonly onTogglePreview: LibraryPreviewToggle;
}) {
  const hasPreview = Boolean(asset.previewUrl);
  const aspectRatio = getLibraryAssetAspectRatio(asset);

  return (
    <article
      className={cn(
        'system-b-library-card group relative min-w-0 overflow-hidden border',
        selected
          ? 'system-b-library-card--selected'
          : 'system-b-library-card--idle'
      )}
    >
      {selected ? (
        <span
          aria-hidden='true'
          className='system-b-library-card-selected-frame pointer-events-none absolute inset-0'
        />
      ) : null}
      <Button
        asChild
        variant='tertiary'
        size='sm'
        static
        className={cn(
          'flex h-full w-full flex-col items-stretch justify-start rounded-none p-0 text-left transition-colors duration-fast ease-subtle hover:bg-transparent active:bg-transparent',
          LIBRARY_CARD_FOCUS_CLASS
        )}
      >
        <button
          type='button'
          onClick={onSelect}
          aria-label={`View ${asset.title}`}
        >
          <div
            className={cn(
              'system-b-library-card-artwork relative overflow-hidden',
              getLibraryAspectRatioClass(aspectRatio)
            )}
          >
            <LibraryMediaThumbnail asset={asset} size='card' />
            <span
              role='status'
              className={cn(
                'system-b-library-card-status absolute left-2 top-2 border px-1.5 py-0.5 leading-4',
                releaseStatusClasses(asset.status)
              )}
              data-testid={`library-release-status-${asset.id}`}
              aria-label={`Release Status: ${formatLibraryStatus(asset)}`}
            >
              {formatLibraryStatus(asset)}
            </span>
          </div>
          <div className='min-w-0 p-3'>
            <div className='flex min-w-0 items-start justify-between gap-2'>
              <div className='min-w-0'>
                <h2 className='system-b-library-card-title truncate'>
                  {asset.title}
                </h2>
                <p className='system-b-library-card-meta mt-0.5 truncate'>
                  {asset.artist}
                </p>
              </div>
              {getLibraryItemKind(asset) === 'merch' ? (
                <span className='system-b-library-card-count shrink-0 tabular-nums'>
                  {asset.salePriceLabel ?? 'Merch'}
                </span>
              ) : (
                <span
                  className='system-b-library-card-count shrink-0 tabular-nums'
                  role='img'
                  aria-label={`${asset.providerCount} Providers`}
                  title={`${asset.providerCount} Providers`}
                >
                  {formatCompactCount(asset.providerCount)}
                </span>
              )}
            </div>
            <div className='system-b-library-card-summary mt-2 flex min-w-0 items-center gap-1.5'>
              {getLibraryItemKind(asset) === 'merch' ? (
                <Shirt className='h-3 w-3 shrink-0' />
              ) : (
                <Disc3 className='h-3 w-3 shrink-0' />
              )}
              <span>{formatLibraryItemType(asset)}</span>
              {getLibraryItemKind(asset) === 'release' ? (
                <>
                  <span className='opacity-50'>.</span>
                  <span>{asset.trackCount} Tracks</span>
                </>
              ) : null}
            </div>
            <div className='mt-3 flex flex-wrap gap-1.5'>
              {asset.assetKinds.slice(0, 3).map(kind => (
                <AssetKindPill key={kind} kind={kind} />
              ))}
              {asset.assetKinds.length > 3 ? (
                <span className='system-b-library-card-more-pill inline-flex h-6 items-center px-2'>
                  +{asset.assetKinds.length - 3}
                </span>
              ) : null}
            </div>
          </div>
        </button>
      </Button>
      {hasPreview ? (
        <button
          type='button'
          onClick={event => onTogglePreview(asset, event)}
          aria-label={
            isPreviewPlaying
              ? `Pause Preview for ${asset.title}`
              : `Play Preview for ${asset.title}`
          }
          aria-pressed={isPreviewPlaying}
          data-testid={`library-preview-card-${asset.id}`}
          className={cn(
            'system-b-library-preview-float absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center backdrop-blur',
            isPreviewActive
              ? 'opacity-100'
              : 'opacity-90 group-hover:opacity-100',
            LIBRARY_CARD_FOCUS_CLASS
          )}
        >
          {isPreviewPlaying ? (
            <Pause className='h-3.5 w-3.5' strokeWidth={2.5} />
          ) : (
            <PlayCircle className='h-3.5 w-3.5' strokeWidth={2.25} />
          )}
          <span className='sr-only'>
            {isPreviewPlaying ? 'Pause Preview' : 'Play Preview'}
          </span>
        </button>
      ) : null}
    </article>
  );
});

function AssetGrid({
  assets,
  selectedId,
  activePreviewId,
  playingPreviewId,
  gridDensity,
  onSelect,
  onTogglePreview,
  getContextMenuItems,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly gridDensity: LibraryGridDensity;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
}) {
  return (
    <div
      className={cn(
        LIBRARY_GRID_DENSITY_LAYOUT[gridDensity],
        LIBRARY_CONTENT_INSET_CLASS
      )}
    >
      {assets.map(asset => (
        <TableContextMenu key={asset.id} items={getContextMenuItems(asset)}>
          <AssetCard
            asset={asset}
            selected={selectedId === asset.id}
            isPreviewActive={activePreviewId === asset.id}
            isPreviewPlaying={playingPreviewId === asset.id}
            onSelect={() => onSelect(asset.id)}
            onTogglePreview={onTogglePreview}
          />
        </TableContextMenu>
      ))}
    </div>
  );
}

function useLibraryTableRowState(selectedId: string | null) {
  const getRowId = useMemo(() => (asset: LibraryReleaseAsset) => asset.id, []);
  const rowSelection = useMemo<RowSelectionState>(
    () => (selectedId ? { [selectedId]: true } : {}),
    [selectedId]
  );
  const getRowClassName = useCallback(
    (asset: LibraryReleaseAsset) =>
      asset.id === selectedId ? 'system-b-library-table-row-selected' : '',
    [selectedId]
  );

  return { getRowId, rowSelection, getRowClassName };
}

function LibraryReleaseTable({
  assets,
  selectedId,
  columns,
  hideHeader,
  rowTestIdPrefix,
  playingPreviewId,
  onSelect,
  onTogglePreview,
  getContextMenuItems,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly columns: ColumnDef<LibraryReleaseAsset, unknown>[];
  readonly hideHeader?: boolean;
  readonly rowTestIdPrefix: 'library-release-row' | 'library-catalog-row';
  readonly playingPreviewId?: string | null;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview?: LibraryPreviewToggle;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
}) {
  const tableData = useMemo(() => [...assets], [assets]);
  const previewContext = useMemo(
    () => ({
      playingPreviewId: playingPreviewId ?? null,
      onTogglePreview: onTogglePreview ?? noopPreviewToggle,
    }),
    [onTogglePreview, playingPreviewId]
  );
  const { getRowId, rowSelection, getRowClassName } =
    useLibraryTableRowState(selectedId);
  const getRowTestId = useCallback(
    (asset: LibraryReleaseAsset) => `${rowTestIdPrefix}-${asset.id}`,
    [rowTestIdPrefix]
  );

  const table = (
    <UnifiedTable<LibraryReleaseAsset>
      data={tableData}
      columns={columns}
      onRowClick={asset => onSelect(asset.id)}
      getRowId={getRowId}
      getRowTestId={getRowTestId}
      rowSelection={rowSelection}
      getRowClassName={getRowClassName}
      getContextMenuItems={getContextMenuItems}
      enableVirtualization={assets.length >= 20}
      rowHeight={LIBRARY_TABLE_ROW_HEIGHT}
      minWidth={LIBRARY_TABLE_MIN_WIDTH}
      hideHeader={hideHeader}
      className='system-b-library-table'
      containerClassName={cn('h-full', LIBRARY_CONTENT_INSET_CLASS)}
      skeletonRows={SKELETON_ROW_COUNT.TABLE}
      skeletonColumnConfig={LIBRARY_TABLE_SKELETON_CONFIG}
    />
  );

  if (!onTogglePreview) {
    return table;
  }

  return (
    <LibraryPreviewContext.Provider value={previewContext}>
      {table}
    </LibraryPreviewContext.Provider>
  );
}

function EmptyCatalog() {
  return (
    <PageShell
      aria-label='Library'
      frame='content-container'
      contentPadding='none'
      data-testid='library-surface'
    >
      <TableEmptyState
        icon={<Music2 className='h-5 w-5' strokeWidth={2.25} />}
        title='No Library Items'
        description='Releases, merch, images, videos, and audio will appear here as they land.'
        className='m-3 min-h-90'
        action={
          <Link
            href={APP_ROUTES.RELEASES}
            className={cn(
              'system-b-library-action system-b-library-action--standard system-b-library-action--surface-0 inline-flex items-center border border-subtle',
              LIBRARY_BUTTON_FOCUS_CLASS
            )}
          >
            Open Releases
          </Link>
        }
      />
    </PageShell>
  );
}

function NoResults({ onReset }: { readonly onReset: () => void }) {
  return (
    <TableEmptyState
      title='No Assets Match'
      description='No library items match the selected view or filters.'
      className='m-3 min-h-75'
      action={
        <button
          type='button'
          onClick={onReset}
          className={cn(
            'system-b-library-action system-b-library-action--standard system-b-library-action--surface-0 inline-flex items-center border border-subtle',
            LIBRARY_BUTTON_FOCUS_CLASS
          )}
        >
          Reset View
        </button>
      }
    />
  );
}

function MetadataRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className='system-b-library-metadata-row grid gap-3 border-t border-subtle py-2'>
      <dt className='text-tertiary-token'>{label}</dt>
      <dd className='min-w-0 text-primary-token'>{value}</dd>
    </div>
  );
}

function PreviewActionButton({
  asset,
  isPreviewPlaying,
  onTogglePreview,
  compact = false,
  disabledTabIndex,
  reserveSpace = false,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly isPreviewPlaying: boolean;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly compact?: boolean;
  readonly disabledTabIndex?: number;
  readonly reserveSpace?: boolean;
}) {
  if (!asset.previewUrl) {
    return reserveSpace ? (
      <span
        aria-hidden='true'
        className={cn(
          'pointer-events-none inline-flex shrink-0 opacity-0',
          compact ? 'h-7 w-7' : 'h-8 w-23'
        )}
      />
    ) : null;
  }

  const label = isPreviewPlaying ? 'Pause Preview' : 'Play Preview';

  return (
    <button
      type='button'
      onClick={event => onTogglePreview(asset, event)}
      aria-label={`${label} for ${asset.title}`}
      aria-pressed={isPreviewPlaying}
      tabIndex={disabledTabIndex}
      className={cn(
        'system-b-library-action inline-flex items-center justify-center gap-1.5',
        compact
          ? 'system-b-library-action--icon'
          : 'system-b-library-action--standard border border-subtle',
        LIBRARY_BUTTON_FOCUS_CLASS
      )}
    >
      {isPreviewPlaying ? (
        <Pause className='h-3 w-3' strokeWidth={2.5} />
      ) : (
        <PlayCircle className='h-3 w-3' strokeWidth={2.25} />
      )}
      {compact ? <span className='sr-only'>{label}</span> : label}
    </button>
  );
}

function LibraryAudioPanel({
  asset,
  isPreviewPlaying,
  onTogglePreview,
  onUploaded,
  disabledTabIndex,
  embedded = false,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly isPreviewPlaying: boolean;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly onUploaded: (assetId: string, previewUrl: string) => void;
  readonly disabledTabIndex?: number;
  readonly embedded?: boolean;
}) {
  return (
    <div className={embedded ? undefined : 'mt-4 border-t border-subtle pt-3'}>
      {embedded ? null : (
        <div className='mb-2 flex h-7 items-center justify-between gap-2'>
          <div className='flex min-w-0 items-center gap-2'>
            <FileAudio2 className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
            <h3 className='system-b-library-audio-heading truncate font-semibold text-primary-token'>
              Audio
            </h3>
          </div>
          {asset.previewUrl ? (
            <PreviewActionButton
              asset={asset}
              isPreviewPlaying={isPreviewPlaying}
              onTogglePreview={onTogglePreview}
              compact
              disabledTabIndex={disabledTabIndex}
            />
          ) : null}
        </div>
      )}
      <ReleaseAudioAssetPanel
        releaseId={asset.id}
        releaseTitle={asset.title}
        previewUrl={asset.previewUrl}
        durationMs={asset.totalDurationMs}
        disabledTabIndex={disabledTabIndex}
        testIdPrefix='library'
        onUploaded={previewUrl => onUploaded(asset.id, previewUrl)}
      />
    </div>
  );
}

function ApprovalStatusEditor({
  asset,
  profileId,
  disabled,
  onStatusChange,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly profileId: string | null;
  readonly disabled: boolean;
  readonly onStatusChange: (
    assetId: string,
    approvalStatus: LibraryApprovalStatus
  ) => void;
}) {
  const [saving, setSaving] = useState(false);

  async function handleSelect(nextStatus: LibraryApprovalStatus) {
    if (!profileId || nextStatus === asset.approvalStatus) {
      return;
    }

    setSaving(true);
    onStatusChange(asset.id, nextStatus);

    try {
      const response = await fetch('/api/library/approval-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          assetId: asset.id,
          itemKind: getLibraryItemKind(asset),
          approvalStatus: nextStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('Approval status update failed');
      }
    } catch {
      toast.error('Unable to update approval status right now');
      onStatusChange(asset.id, asset.approvalStatus);
    } finally {
      setSaving(false);
    }
  }

  const isDisabled = disabled || saving || !profileId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          disabled={isDisabled}
          aria-label='Approval Status'
          data-testid={`library-approval-status-select-${asset.id}`}
          className={cn(
            'system-b-library-status-pill inline-flex h-6 items-center gap-1 border px-2',
            libraryApprovalStatusClasses(asset.approvalStatus),
            LIBRARY_BUTTON_FOCUS_CLASS
          )}
        >
          <span>{formatLibraryApprovalStatus(asset.approvalStatus)}</span>
          <ChevronDown
            className='h-3 w-3 shrink-0 opacity-70'
            aria-hidden='true'
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        sideOffset={4}
        data-menu-surface='toolbar'
        className={TOOLBAR_MENU_CONTENT_CLASS}
      >
        {LIBRARY_APPROVAL_STATUSES.map(status => (
          <ToolbarMenuChoiceItem
            key={status}
            active={status === asset.approvalStatus}
            leadingVisual={
              <span
                aria-hidden='true'
                className={cn(
                  'h-2 w-2 shrink-0 rounded-full',
                  libraryApprovalStatusDotClasses(status)
                )}
              />
            }
            label={formatLibraryApprovalStatus(status)}
            onSelect={() => {
              void handleSelect(status);
            }}
            disabled={isDisabled || status === asset.approvalStatus}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function buildLibraryDrawerOverflowActions({
  asset,
  isPreviewPlaying,
  onTogglePreview,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly isPreviewPlaying: boolean;
  readonly onTogglePreview: LibraryPreviewToggle;
}): DrawerHeaderAction[] {
  const href = asset.primaryActionHref ?? asset.smartLinkPath;
  const items: DrawerHeaderAction[] = [];

  if (asset.previewUrl) {
    items.push({
      id: 'play-preview',
      label: isPreviewPlaying ? 'Pause Preview' : 'Play Preview',
      icon: PlayCircle,
      onClick: () => onTogglePreview(asset),
    });
  }

  items.push({
    id: 'open-smart-link',
    label: 'Open Smart Link',
    icon: ExternalLink,
    onClick: () => {
      globalThis.open(href, '_blank', 'noopener,noreferrer');
    },
  });

  const shareUrl = asset.share?.shareUrl;
  if (shareUrl) {
    items.push({
      id: 'copy-share-link',
      label: 'Copy Share Link',
      icon: Share2,
      onClick: () => {
        void globalThis.navigator?.clipboard?.writeText(shareUrl);
      },
    });
  }

  items.push({
    id: 'copy-title',
    label: 'Copy Title',
    icon: Copy,
    onClick: () => {
      void globalThis.navigator?.clipboard?.writeText(asset.title);
    },
  });

  return items;
}

function AssetDrawer({
  asset,
  open,
  onClose,
  activePreviewId,
  playingPreviewId,
  isDesktopLayout,
  onTogglePreview,
  onAudioUploaded,
  getContextMenuItems,
  profileId,
  artistHandle,
  onApprovalStatusChange,
  onShareChange,
}: {
  readonly asset: LibraryReleaseAsset | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly isDesktopLayout: boolean;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly onAudioUploaded: (assetId: string, previewUrl: string) => void;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
  readonly profileId: string | null;
  readonly artistHandle: string | null;
  readonly onApprovalStatusChange: (
    assetId: string,
    approvalStatus: LibraryApprovalStatus
  ) => void;
  readonly onShareChange: (
    assetId: string,
    share: LibraryAssetShareViewModel
  ) => void;
}) {
  const [stickyAsset, setStickyAsset] = useState<LibraryReleaseAsset | null>(
    asset
  );

  useEffect(() => {
    if (asset) setStickyAsset(asset);
  }, [asset]);

  const current = asset ?? stickyAsset;
  const isMerch = current ? getLibraryItemKind(current) === 'merch' : false;
  const closedInteractiveProps = open ? {} : { tabIndex: -1 };
  const closedTabIndex = open ? undefined : -1;
  const currentId = current?.id ?? null;
  const isPreviewPlaying =
    currentId !== null &&
    currentId === playingPreviewId &&
    currentId === activePreviewId;
  const closedDrawerClassName = cn(
    'pointer-events-none opacity-0',
    isDesktopLayout ? null : 'translate-y-2 hidden'
  );
  const drawerHeaderActions = current ? (
    <DrawerHeaderActions
      primaryActions={[]}
      overflowActions={buildLibraryDrawerOverflowActions({
        asset: current,
        isPreviewPlaying,
        onTogglePreview,
      })}
      onClose={onClose}
    />
  ) : null;

  return (
    <aside
      aria-hidden={!open}
      inert={open ? undefined : true}
      className={cn(
        'system-b-library-drawer h-full min-h-0 overflow-hidden border-l border-subtle transition-[opacity,transform] duration-cinematic ease-cinematic',
        isDesktopLayout
          ? 'static z-auto rounded-none border-y-0 border-r-0 shadow-none'
          : 'system-b-library-drawer--mobile fixed inset-x-3 bottom-20 top-16 z-40 border',
        open ? 'translate-y-0 opacity-100' : closedDrawerClassName
      )}
      data-testid='library-asset-drawer'
    >
      {current ? (
        <TableContextMenu items={getContextMenuItems(current)}>
          <div className='flex h-full min-h-0 flex-col gap-1.5 px-1.5 py-1.5 lg:px-0 lg:py-0'>
            <div
              className='shrink-0 space-y-2.5'
              data-testid='library-asset-drawer-sticky-rail'
            >
              <DrawerSurfaceCard variant='card' className='overflow-hidden'>
                <DrawerHeader
                  title={isMerch ? 'Merch' : 'Release'}
                  actions={drawerHeaderActions}
                />
                <div className='space-y-3 overflow-visible px-3 pb-3 pt-3'>
                  <div className='mx-auto flex max-h-72 w-full max-w-56 items-center justify-center overflow-hidden'>
                    <div
                      className={cn(
                        'system-b-library-drawer-artwork overflow-hidden',
                        getLibraryDrawerHeroClass(
                          getLibraryAssetAspectRatio(current)
                        )
                      )}
                    >
                      <LibraryMediaThumbnail asset={current} size='drawer' />
                    </div>
                  </div>

                  <div className='min-w-0'>
                    <h2 className='system-b-library-drawer-title truncate'>
                      {current.title}
                    </h2>
                    <p className='system-b-library-drawer-artist mt-1 truncate'>
                      {current.artist}
                    </p>
                  </div>

                  <div className='flex flex-wrap gap-1.5'>
                    {/*
                      Release Status only in the hero pills. Approval Status is
                      editable once in Details (ApprovalStatusEditor) — never
                      duplicate the axes side-by-side (JOV-3333).
                    */}
                    <span
                      role='status'
                      className={cn(
                        'system-b-library-status-pill inline-flex h-6 items-center border px-2',
                        releaseStatusClasses(current.status)
                      )}
                      data-testid={`library-release-status-${current.id}`}
                      aria-label={`Release Status: ${formatLibraryStatus(current)}`}
                    >
                      {formatLibraryStatus(current)}
                    </span>
                    {current.assetKinds.map(kind => (
                      <AssetKindPill key={kind} kind={kind} />
                    ))}
                  </div>
                </div>
              </DrawerSurfaceCard>
            </div>

            <div className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain lg:px-0 lg:pt-0'>
              <DrawerSectionGroup defaultOpenSectionId='details'>
                <div className='space-y-2.5'>
                  {isMerch ? (
                    <DrawerSection
                      sectionId='merch'
                      surface='card'
                      title='Merch'
                      defaultOpen={false}
                    >
                      <p className='system-b-library-drawer-panel-copy leading-5 text-secondary-token'>
                        {current.description ?? 'Merch card saved from chat.'}
                      </p>
                    </DrawerSection>
                  ) : (
                    <>
                      <DrawerSection
                        sectionId='audio'
                        surface='card'
                        title='Audio'
                        defaultOpen={false}
                        actions={
                          current.previewUrl ? (
                            <PreviewActionButton
                              asset={current}
                              isPreviewPlaying={isPreviewPlaying}
                              onTogglePreview={onTogglePreview}
                              compact
                              disabledTabIndex={closedTabIndex}
                            />
                          ) : null
                        }
                      >
                        <LibraryAudioPanel
                          asset={current}
                          isPreviewPlaying={isPreviewPlaying}
                          onTogglePreview={onTogglePreview}
                          onUploaded={onAudioUploaded}
                          disabledTabIndex={closedTabIndex}
                          embedded
                        />
                      </DrawerSection>

                      <DrawerSection
                        sectionId='share-link'
                        surface='card'
                        title='Share Link'
                        defaultOpen={false}
                      >
                        <LibraryAssetSharePanel
                          asset={current}
                          profileId={profileId}
                          artistHandle={artistHandle}
                          disabled={!open}
                          initialShare={current.share}
                          onShareChange={onShareChange}
                        />
                      </DrawerSection>

                      <DrawerSection
                        sectionId='press-kit-drop'
                        surface='card'
                        title='Press Kit Drop'
                        defaultOpen={false}
                      >
                        <LibraryShareDropCreator
                          releaseIds={[current.id]}
                          defaultTitle={`${current.title} press kit`}
                        />
                      </DrawerSection>
                    </>
                  )}

                  <DrawerSection
                    sectionId='details'
                    surface='card'
                    title='Details'
                    defaultOpen={false}
                  >
                    <dl>
                      <MetadataRow
                        label='Approval Status'
                        value={
                          <ApprovalStatusEditor
                            asset={current}
                            profileId={profileId}
                            disabled={!open}
                            onStatusChange={onApprovalStatusChange}
                          />
                        }
                      />
                      <MetadataRow
                        label={isMerch ? 'Updated' : 'Release Date'}
                        value={formatLibraryReleaseDate(current.releaseDate)}
                      />
                      <MetadataRow
                        label='Type'
                        value={formatLibraryItemType(current)}
                      />
                      {isMerch ? (
                        <>
                          <MetadataRow
                            label='Sale Price'
                            value={current.salePriceLabel ?? 'No Price'}
                          />
                          <MetadataRow
                            label='Profit'
                            value={current.profitLabel ?? 'No Estimate'}
                          />
                          <MetadataRow
                            label='Sellability'
                            value={current.sellabilityLabel ?? 'Not Checked'}
                          />
                        </>
                      ) : (
                        <>
                          <MetadataRow
                            label='Tracks'
                            value={current.trackCount}
                          />
                          <MetadataRow
                            label='Duration'
                            value={formatLibraryDuration(
                              current.totalDurationMs
                            )}
                          />
                          <MetadataRow
                            label='Popularity'
                            value={
                              current.spotifyPopularity == null
                                ? 'No Score'
                                : `${current.spotifyPopularity}/100`
                            }
                          />
                          <MetadataRow
                            label='Genres'
                            value={
                              current.genres.length > 0
                                ? current.genres.join(', ')
                                : 'No Genres'
                            }
                          />
                          <MetadataRow
                            label='Label'
                            value={
                              current.label ?? current.distributor ?? 'No Label'
                            }
                          />
                          <MetadataRow
                            label='UPC'
                            value={current.upc ?? 'No UPC'}
                          />
                          <MetadataRow
                            label='Pitch Targets'
                            value={current.targetPlaylistCount}
                          />
                        </>
                      )}
                    </dl>
                  </DrawerSection>

                  {!isMerch ? (
                    <DrawerSection
                      sectionId='providers'
                      surface='card'
                      title='Providers'
                      defaultOpen={false}
                    >
                      {current.providers.length > 0 ? (
                        <div className='space-y-1'>
                          {current.providers.map(provider => (
                            <a
                              key={`${current.id}-${provider.key}`}
                              href={provider.url}
                              target='_blank'
                              rel='noopener noreferrer'
                              {...closedInteractiveProps}
                              className={cn(
                                'system-b-library-provider-link flex h-8 items-center gap-2 px-2',
                                LIBRARY_CARD_FOCUS_CLASS
                              )}
                            >
                              <ProviderIcon
                                provider={provider.key as ProviderKey}
                                className='h-3.5 w-3.5'
                              />
                              <span className='min-w-0 flex-1 truncate'>
                                {provider.label}
                              </span>
                              <ExternalLink className='h-3 w-3 text-tertiary-token' />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <p className='system-b-library-provider-empty leading-5 text-secondary-token'>
                          No provider links are connected for this release yet.
                        </p>
                      )}
                    </DrawerSection>
                  ) : null}
                </div>
              </DrawerSectionGroup>
            </div>
          </div>
        </TableContextMenu>
      ) : null}
    </aside>
  );
}

function LibraryStatusBar({
  visibleCount,
  totalCount,
  sort,
  view,
  activePreviewTitle,
}: {
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly sort: LibrarySortKey;
  readonly view: LibraryViewMode;
  readonly activePreviewTitle: string | null;
}) {
  const viewLabel =
    view === 'grid' ? 'Grid' : view === 'table' ? 'Table' : 'List';
  const idleSummary = `${SORT_LABELS[sort]} - ${viewLabel}`;
  const playbackSummary = activePreviewTitle
    ? `Playing ${activePreviewTitle}`
    : idleSummary;

  return (
    <div className='system-b-library-status-bar hidden h-8 shrink-0 items-center justify-between gap-3 border-t border-subtle px-(--linear-app-header-padding-x) sm:flex'>
      <span className='min-w-0 truncate'>
        {visibleCount} of {totalCount} Items
      </span>
      <span className='min-w-0 truncate text-right'>{playbackSummary}</span>
    </div>
  );
}

export function LibrarySurface({
  assets,
  profileId = null,
  artistHandle = null,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly profileId?: string | null;
  readonly artistHandle?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const [audioOverrides, setAudioOverrides] = useState<Record<string, string>>(
    {}
  );
  const [approvalStatusOverrides, setApprovalStatusOverrides] = useState<
    Record<string, LibraryApprovalStatus>
  >({});
  const [shareOverrides, setShareOverrides] = useState<
    Record<string, LibraryAssetShareViewModel>
  >({});
  const [preset, setPreset] = useState<LibraryPresetId>(() =>
    parseLibraryViewParam(searchParams.get('view'))
  );
  const [savedView, setSavedView] = useState<LibrarySavedViewId>(() =>
    readPersistedLibrarySavedView()
  );
  const [filters, setFilters] = useState<LibraryFilters>(() => emptyFilters());
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<LibrarySortKey>('releaseDate');
  const { view, setView } = useLibraryViewMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const { density: gridDensity, setDensity: setGridDensity } =
    useLibraryGridDensity();
  const isDesktopLayout = useBreakpoint('lg');
  const deferredFilters = useDeferredValue(filters);
  const deferredPreset = useDeferredValue(preset);
  const deferredSavedView = useDeferredValue(savedView);
  const deferredPills = useDeferredValue(pills);
  const deferredSort = useDeferredValue(sort);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  useEffect(() => {
    setPreset(parseLibraryViewParam(searchParams.get('view')));
  }, [searchParams]);

  // Version-stack duplicate ingests so each release renders as one row
  // (JOV-3089); overrides then layer on top of the surviving canonical row.
  const effectiveAssets = useMemo<readonly LibraryReleaseAsset[]>(
    () =>
      stackLibraryReleaseVersions(assets).map((asset): LibraryReleaseAsset => {
        const previewUrl = audioOverrides[asset.id];
        const approvalStatus =
          approvalStatusOverrides[asset.id] ?? asset.approvalStatus;
        const share = shareOverrides[asset.id] ?? asset.share ?? null;
        const assetKinds: readonly LibraryAssetKind[] =
          previewUrl && !asset.assetKinds.includes('preview')
            ? [...asset.assetKinds, 'preview']
            : asset.assetKinds;

        if (
          !previewUrl &&
          approvalStatus === asset.approvalStatus &&
          share === (asset.share ?? null)
        ) {
          return asset;
        }

        return {
          ...asset,
          ...(previewUrl ? { previewUrl } : {}),
          approvalStatus,
          share,
          assetKinds,
        };
      }),
    [approvalStatusOverrides, assets, audioOverrides, shareOverrides]
  );

  const visibleAssets = useMemo(() => {
    const presetPredicate =
      PRESETS.find(item => item.id === deferredPreset)?.predicate ??
      (() => true);
    const savedViewPredicate = getLibrarySavedViewPredicate(deferredSavedView);
    const normalizedQuery = deferredSearchQuery.trim().toLowerCase();

    return effectiveAssets
      .filter(presetPredicate)
      .filter(savedViewPredicate)
      .filter(asset => assetMatchesFilters(asset, deferredFilters))
      .filter(asset => assetMatchesPills(asset, deferredPills))
      .filter(asset => assetMatchesSearchQuery(asset, normalizedQuery))
      .toSorted(compareAssets(deferredSort));
  }, [
    deferredFilters,
    deferredPills,
    deferredPreset,
    deferredSavedView,
    deferredSearchQuery,
    deferredSort,
    effectiveAssets,
  ]);

  const artistOptions = useMemo(
    () => uniqueSorted(effectiveAssets.map(asset => asset.artist)),
    [effectiveAssets]
  );
  const titleOptions = useMemo(
    () => uniqueSorted(effectiveAssets.map(asset => asset.title)),
    [effectiveAssets]
  );
  const statusOptions = useMemo(
    () => uniqueSorted(effectiveAssets.map(asset => asset.status)),
    [effectiveAssets]
  );
  const hasOptions = useMemo(
    () => uniqueSorted(effectiveAssets.flatMap(asset => asset.assetKinds)),
    [effectiveAssets]
  );

  const selectedAsset =
    visibleAssets.find(asset => asset.id === selectedId) ?? null;
  const activePreviewAsset =
    effectiveAssets.find(asset => asset.id === playbackState.activeTrackId) ??
    null;
  const activePreviewId = activePreviewAsset?.id ?? null;
  const playingPreviewId = playbackState.isPlaying ? activePreviewId : null;
  const activePreviewTitle =
    activePreviewAsset && playingPreviewId === activePreviewAsset.id
      ? activePreviewAsset.title
      : null;

  const handleTogglePreview = useCallback<LibraryPreviewToggle>(
    (asset, event) => {
      event?.stopPropagation();
      if (playbackState.activeTrackId === asset.id) {
        toggleTrack({ id: asset.id, title: asset.title }).catch(() => {
          toast.error('Unable to control playback right now');
        });
        return;
      }

      if (!asset.previewUrl) return;

      toggleTrack({
        id: asset.id,
        title: asset.title,
        audioUrl: asset.previewUrl,
        releaseTitle: asset.title,
        artistName: asset.artist,
        artworkUrl: asset.artworkUrl,
        hasLyrics: asset.hasLyrics,
      }).catch(() => {
        toast.error('Unable to play preview');
      });
    },
    [playbackState.activeTrackId, toggleTrack]
  );

  useEffect(() => {
    if (selectedId && !visibleAssets.some(asset => asset.id === selectedId)) {
      setSelectedId(null);
      setDrawerOpen(false);
    }
  }, [selectedId, visibleAssets]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key === 'Escape' && drawerOpen) {
        event.preventDefault();
        setDrawerOpen(false);
      }
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const handlePresetChange = useCallback(
    (next: LibraryPresetId) => {
      setPreset(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') {
        params.delete('view');
      } else {
        params.set('view', next);
      }
      const query = params.toString();
      router.replace(
        query ? `${APP_ROUTES.LIBRARY}?${query}` : APP_ROUTES.LIBRARY,
        { scroll: false }
      );
    },
    [router, searchParams]
  );

  const handleSavedViewChange = useCallback((next: LibrarySavedViewId) => {
    setSavedView(next);
    persistLibrarySavedView(next);
  }, []);

  function resetView() {
    handlePresetChange('all');
    handleSavedViewChange('all');
    setFilters(emptyFilters());
    setPills([]);
    setSearchQuery('');
  }

  function openAsset(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  const getContextMenuItems = useCallback<LibraryContextMenuBuilder>(
    asset => {
      const href = asset.primaryActionHref ?? asset.smartLinkPath;
      const items: ContextMenuItemType[] = [];

      if (asset.previewUrl) {
        items.push({
          id: 'play-preview',
          label:
            playingPreviewId === asset.id ? 'Pause Preview' : 'Play Preview',
          icon: <PlayCircle className='h-3.5 w-3.5' />,
          onClick: () => handleTogglePreview(asset),
        });
      }

      items.push({
        id: 'open-smart-link',
        label: 'Open Smart Link',
        icon: <ExternalLink className='h-3.5 w-3.5' />,
        onClick: () => {
          globalThis.open(href, '_blank', 'noopener,noreferrer');
        },
      });

      const shareUrl = asset.share?.shareUrl;
      if (shareUrl) {
        items.push({
          id: 'copy-share-link',
          label: 'Copy Share Link',
          icon: <Share2 className='h-3.5 w-3.5' />,
          onClick: () => {
            void globalThis.navigator?.clipboard?.writeText(shareUrl);
          },
        });
      }

      items.push({
        id: 'copy-title',
        label: 'Copy Title',
        icon: <Copy className='h-3.5 w-3.5' />,
        onClick: () => {
          void globalThis.navigator?.clipboard?.writeText(asset.title);
        },
      });

      return items;
    },
    [handleTogglePreview, playingPreviewId]
  );

  const handleApprovalStatusChange = useCallback(
    (assetId: string, approvalStatus: LibraryApprovalStatus) => {
      setApprovalStatusOverrides(previous => ({
        ...previous,
        [assetId]: approvalStatus,
      }));
    },
    []
  );

  const handleShareChange = useCallback(
    (assetId: string, share: LibraryAssetShareViewModel) => {
      setShareOverrides(previous => ({
        ...previous,
        [assetId]: share,
      }));
    },
    []
  );

  const activeFilterCount =
    filters.statuses.size +
    filters.releaseTypes.size +
    filters.assetKinds.size +
    filters.providers.size;

  const headerSearchAdapter = useMemo(
    () =>
      effectiveAssets.length === 0
        ? null
        : {
            key: 'library',
            pills,
            onPillsChange: setPills,
            artistOptions,
            titleOptions,
            albumOptions: [],
            statusOptions,
            hasOptions,
            totalCount: effectiveAssets.length,
            visibleCount: visibleAssets.length,
            triggerLabel:
              pills.length > 0
                ? `Filter Library (${pills.length})`
                : 'Filter Library',
            ariaLabel: 'Filter library assets',
            placeholder: 'Search library',
            allowedFields: ['artist', 'title', 'status', 'has'] as const,
          },
    [
      artistOptions,
      effectiveAssets.length,
      hasOptions,
      pills,
      statusOptions,
      titleOptions,
      visibleAssets.length,
    ]
  );

  useRegisterHeaderSearch(headerSearchAdapter);

  const libraryRail = useMemo(
    () => (
      <LibraryRail
        assets={effectiveAssets}
        savedView={savedView}
        onSavedView={handleSavedViewChange}
        filters={filters}
        onFilters={setFilters}
        onClearFilters={() => setFilters(emptyFilters())}
      />
    ),
    [effectiveAssets, filters, handleSavedViewChange, savedView]
  );

  useRegisterShellSidebarOverride(
    effectiveAssets.length > 0
      ? {
          key: 'library',
          backHref: APP_ROUTES.CHAT,
          backLabel: 'Back to App',
          content: libraryRail,
        }
      : null
  );

  const handleAudioUploaded = useCallback(
    (assetId: string, previewUrl: string) => {
      setAudioOverrides(previous => ({
        ...previous,
        [assetId]: previewUrl,
      }));
      router.refresh();
    },
    [router]
  );

  const drawerColumnWidth = drawerOpen ? '360px' : '0px';
  const libraryGridTemplateColumns = isDesktopLayout
    ? `minmax(0,1fr) ${drawerColumnWidth}`
    : 'minmax(0, 1fr)';

  if (effectiveAssets.length === 0) {
    return <EmptyCatalog />;
  }

  return (
    <PageShell
      aria-label='Library'
      frame='content-container'
      contentPadding='none'
      data-testid='library-surface'
      toolbar={
        <LibraryToolbar
          assets={effectiveAssets}
          preset={preset}
          onPreset={handlePresetChange}
          sort={sort}
          onSort={setSort}
          view={view}
          onView={setView}
          gridDensity={gridDensity}
          onGridDensity={setGridDensity}
          searchQuery={searchQuery}
          onSearchQuery={setSearchQuery}
          visibleCount={visibleAssets.length}
          totalCount={effectiveAssets.length}
          mobileFiltersOpen={mobileFiltersOpen}
          onToggleMobileFilters={() => setMobileFiltersOpen(value => !value)}
          activeFilterCount={activeFilterCount}
        />
      }
    >
      {mobileFiltersOpen ? (
        <div className='lg:hidden'>
          {cloneElement(libraryRail, {
            className: 'max-h-[45svh] shrink-0 border-b border-subtle',
          })}
        </div>
      ) : null}

      <div
        className='grid h-full min-h-0 flex-1 overflow-hidden'
        style={
          {
            gridTemplateColumns: libraryGridTemplateColumns,
            transition:
              'grid-template-columns var(--duration-cinematic) var(--ease-cinematic)',
          } as CSSProperties
        }
      >
        <div className='flex min-h-0 min-w-0 flex-col overflow-hidden'>
          <div className='min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0'>
            {visibleAssets.length === 0 ? (
              <NoResults onReset={resetView} />
            ) : view === 'grid' ? (
              <AssetGrid
                assets={visibleAssets}
                selectedId={selectedId}
                activePreviewId={activePreviewId}
                playingPreviewId={playingPreviewId}
                gridDensity={gridDensity}
                onSelect={openAsset}
                onTogglePreview={handleTogglePreview}
                getContextMenuItems={getContextMenuItems}
              />
            ) : view === 'table' ? (
              <LibraryReleaseTable
                assets={visibleAssets}
                selectedId={selectedId}
                columns={LIBRARY_CATALOG_COLUMNS}
                rowTestIdPrefix='library-catalog-row'
                onSelect={openAsset}
                getContextMenuItems={getContextMenuItems}
              />
            ) : (
              <LibraryReleaseTable
                assets={visibleAssets}
                selectedId={selectedId}
                columns={LIBRARY_TABLE_COLUMNS}
                hideHeader
                rowTestIdPrefix='library-release-row'
                playingPreviewId={playingPreviewId}
                onSelect={openAsset}
                onTogglePreview={handleTogglePreview}
                getContextMenuItems={getContextMenuItems}
              />
            )}
          </div>
          <LibraryStatusBar
            visibleCount={visibleAssets.length}
            totalCount={effectiveAssets.length}
            sort={sort}
            view={view}
            activePreviewTitle={activePreviewTitle}
          />
        </div>
        <AssetDrawer
          asset={selectedAsset}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activePreviewId={activePreviewId}
          playingPreviewId={playingPreviewId}
          isDesktopLayout={isDesktopLayout}
          onTogglePreview={handleTogglePreview}
          onAudioUploaded={handleAudioUploaded}
          getContextMenuItems={getContextMenuItems}
          profileId={profileId}
          artistHandle={artistHandle}
          onApprovalStatusChange={handleApprovalStatusChange}
          onShareChange={handleShareChange}
        />
      </div>
    </PageShell>
  );
}
