'use client';

import {
  type ColumnDef,
  createColumnHelper,
  type RowSelectionState,
} from '@tanstack/react-table';
import { upload } from '@vercel/blob/client';
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
  Loader2,
  type LucideIcon,
  Music2,
  Pause,
  PlayCircle,
  Shirt,
  Upload,
  Video,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type ChangeEvent,
  type CSSProperties,
  cloneElement,
  createContext,
  type DragEvent,
  type MouseEvent,
  memo,
  type ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { ArtworkFallbackTile } from '@/components/atoms/ArtworkFallbackTile';
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
import type { FilterPill } from '@/components/shell/pill-search.types';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterHeaderSearch } from '@/contexts/HeaderActionsContext';
import { useRegisterShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import {
  formatLibraryDuration,
  formatLibraryReleaseDate,
  getLibraryItemKind,
  type LibraryAssetKind,
  type LibraryReleaseAsset,
  type LibraryView,
  libraryAssetMatchesView,
} from './library-data';

const LIBRARY_TABLE_ROW_HEIGHT = 56;
const LIBRARY_TABLE_MIN_WIDTH = '0';
const LIBRARY_CARD_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none';
const LIBRARY_BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none';
const LIBRARY_ICON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none';
const LIBRARY_AUDIO_MAX_FILE_SIZE = 150 * 1024 * 1024;
const LIBRARY_AUDIO_ACCEPT =
  'audio/aac,audio/aiff,audio/flac,audio/mp4,audio/mpeg,audio/wav,audio/x-aiff,audio/x-flac,audio/x-m4a,audio/x-wav';
const LIBRARY_AUDIO_MIME_TYPES = new Set([
  'audio/aac',
  'audio/aiff',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-aiff',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-wav',
]);

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
  { variant: 'badge', width: '92px' },
  { variant: 'text', width: '88px' },
  { variant: 'meta', width: '72px' },
  { variant: 'text', width: '96px' },
];

type LibraryViewMode = 'grid' | 'list';
type LibrarySortKey = 'releaseDate' | 'title' | 'status' | 'providers';
type LibraryPresetId = LibraryView;
type ArtworkSize = 'card' | 'row' | 'drawer';
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

function releaseStatusClasses(status: LibraryReleaseAsset['status']): string {
  if (status === 'released') {
    return 'border-success/20 bg-success/10 text-success';
  }
  if (status === 'scheduled') {
    return 'border-info/20 bg-info/10 text-info';
  }
  return 'border-subtle bg-surface-1 text-tertiary-token';
}

function releaseStatusDotClasses(
  status: LibraryReleaseAsset['status']
): string {
  if (status === 'released') return 'bg-success';
  if (status === 'scheduled') return 'bg-info';
  return 'bg-tertiary-token';
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

function Artwork({
  asset,
  size = 'card',
}: {
  readonly asset: LibraryReleaseAsset;
  readonly size?: ArtworkSize;
}) {
  const sizeClasses = {
    card: 'h-full w-full',
    row: 'h-10 w-10',
    drawer: 'h-full w-full',
  } satisfies Record<ArtworkSize, string>;

  if (asset.artworkUrl) {
    return (
      <Image
        src={asset.artworkUrl}
        alt=''
        width={size === 'row' ? 48 : 320}
        height={size === 'row' ? 48 : 320}
        className={cn('object-cover', sizeClasses[size])}
        loading={size === 'row' ? 'lazy' : 'eager'}
        unoptimized
      />
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden border border-subtle bg-surface-1',
        sizeClasses[size]
      )}
    >
      <ArtworkFallbackTile
        seed={asset.title}
        iconClassName={size === 'row' ? 'h-4 w-4' : 'h-[36%] w-[36%]'}
      />
    </div>
  );
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
        <Artwork asset={asset} size='row' />
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
      className={cn(
        'system-b-library-status-pill inline-flex h-6 w-fit items-center border px-2 leading-4',
        releaseStatusClasses(asset.status)
      )}
    >
      {formatLibraryStatus(asset)}
    </span>
  );
});

const ProvidersCell = memo(function ProvidersCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span className='system-b-library-count-pill inline-flex h-6 min-w-7 items-center justify-center border border-subtle px-2 tabular-nums text-secondary-token'>
      {formatCompactCount(asset.providerCount)}
    </span>
  );
});

const libraryColumnHelper = createColumnHelper<LibraryReleaseAsset>();

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
    header: 'Status',
    cell: ({ row }) => <StatusCell asset={row.original} />,
    size: 112,
    minSize: 96,
    meta: { className: 'hidden md:table-cell px-2' },
  }),
  libraryColumnHelper.display({
    id: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className='system-b-library-meta-text truncate text-tertiary-token'>
        {formatLibraryItemType(row.original)}
      </span>
    ),
    size: 104,
    minSize: 88,
    meta: { className: 'hidden lg:table-cell px-2' },
  }),
  libraryColumnHelper.display({
    id: 'providers',
    header: 'Providers',
    cell: ({ row }) => <ProvidersCell asset={row.original} />,
    size: 86,
    minSize: 72,
    meta: { className: 'hidden md:table-cell px-2' },
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
        containerClassName='h-full px-2.5 pb-2.5 pt-1'
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

function LibraryRail({
  assets,
  filters,
  onFilters,
  onClearFilters,
  className,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
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
      aria-label='Library filters'
      className={cn(
        'system-b-library-rail flex min-h-0 flex-col p-2.5',
        className
      )}
    >
      <div className='min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='flex items-center justify-between gap-2 pb-1 pt-2'>
          <p className='system-b-library-rail-title'>Filters</p>
          {hasActiveFilters(filters) ? (
            <button
              type='button'
              onClick={onClearFilters}
              className='system-b-library-clear-button px-1.5 py-0.5'
            >
              Clear Filters ({activeFilterCount})
            </button>
          ) : null}
        </div>

        <FilterSection label='Status'>
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
                icon={Music2}
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
      <button
        id={buttonId}
        type='button'
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className='system-b-library-filter-section-button flex h-6 w-full items-center justify-between px-1'
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
  dotClassName,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon?: LucideIcon;
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
      {Icon ? (
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
        label='Grid view'
        icon={<Grid3x3 className={PAGE_TOOLBAR_ICON_CLASS} />}
        active={view === 'grid'}
        onClick={() => onView('grid')}
        iconOnly
        tooltipLabel='Grid view'
      />
      <PageToolbarActionButton
        label='List view'
        icon={<LayoutList className={PAGE_TOOLBAR_ICON_CLASS} />}
        active={view === 'list'}
        onClick={() => onView('list')}
        iconOnly
        tooltipLabel='List view'
      />
    </div>
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
      <button
        type='button'
        onClick={onSelect}
        aria-label={`Inspect ${asset.title}`}
        className={cn(
          'system-b-library-card-button flex h-full w-full flex-col text-left',
          LIBRARY_CARD_FOCUS_CLASS
        )}
      >
        <div className='system-b-library-card-artwork relative aspect-square overflow-hidden'>
          <Artwork asset={asset} />
          <span
            className={cn(
              'system-b-library-card-status absolute left-2 top-2 border px-1.5 py-0.5 leading-4',
              releaseStatusClasses(asset.status)
            )}
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
            <span className='system-b-library-card-count shrink-0 tabular-nums'>
              {getLibraryItemKind(asset) === 'merch'
                ? (asset.salePriceLabel ?? 'Merch')
                : formatCompactCount(asset.providerCount)}
            </span>
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
  onSelect,
  onTogglePreview,
  getContextMenuItems,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
}) {
  return (
    <div className='grid gap-2.5 px-2.5 pb-2.5 pt-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
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

function LibraryDataTable({
  assets,
  selectedId,
  playingPreviewId,
  onSelect,
  onTogglePreview,
  getContextMenuItems,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly playingPreviewId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
}) {
  const tableData = useMemo(() => [...assets], [assets]);
  const previewContext = useMemo(
    () => ({ playingPreviewId, onTogglePreview }),
    [onTogglePreview, playingPreviewId]
  );
  const getRowId = useMemo(() => (asset: LibraryReleaseAsset) => asset.id, []);
  const getRowTestId = useMemo(
    () => (asset: LibraryReleaseAsset) => `library-release-row-${asset.id}`,
    []
  );
  const rowSelection = useMemo<RowSelectionState>(
    () => (selectedId ? { [selectedId]: true } : {}),
    [selectedId]
  );
  const getRowClassName = useCallback(
    (asset: LibraryReleaseAsset) =>
      asset.id === selectedId ? 'system-b-library-table-row-selected' : '',
    [selectedId]
  );

  return (
    <LibraryPreviewContext.Provider value={previewContext}>
      <UnifiedTable<LibraryReleaseAsset>
        data={tableData}
        columns={LIBRARY_TABLE_COLUMNS}
        onRowClick={asset => onSelect(asset.id)}
        getRowId={getRowId}
        getRowTestId={getRowTestId}
        rowSelection={rowSelection}
        getRowClassName={getRowClassName}
        getContextMenuItems={getContextMenuItems}
        enableVirtualization={assets.length >= 20}
        rowHeight={LIBRARY_TABLE_ROW_HEIGHT}
        minWidth={LIBRARY_TABLE_MIN_WIDTH}
        hideHeader
        className='system-b-library-table'
        containerClassName='h-full px-2.5 pb-2.5 pt-1'
        skeletonRows={SKELETON_ROW_COUNT.TABLE}
        skeletonColumnConfig={LIBRARY_TABLE_SKELETON_CONFIG}
      />
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
        className='m-3 min-h-[360px]'
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
      className='m-3 min-h-[300px]'
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
          compact ? 'h-7 w-7' : 'h-8 w-[92px]'
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
        'system-b-library-action inline-flex items-center justify-center gap-1.5 border border-subtle',
        compact
          ? 'system-b-library-action--icon'
          : 'system-b-library-action--standard',
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

function isSupportedAudioFile(file: File): boolean {
  if (LIBRARY_AUDIO_MIME_TYPES.has(file.type)) return true;
  return /\.(aac|aiff?|flac|m4a|mp3|wav)$/i.test(file.name);
}

function LibraryAudioDropzone({
  asset,
  onUploaded,
  disabledTabIndex,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly onUploaded: (assetId: string, previewUrl: string) => void;
  readonly disabledTabIndex?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isSupportedAudioFile(file)) {
        setUploadError('Use MP3, WAV, FLAC, AIFF, AAC, or M4A audio.');
        return;
      }

      if (file.size > LIBRARY_AUDIO_MAX_FILE_SIZE) {
        setUploadError('Audio must be 150 MB or smaller.');
        return;
      }

      setUploading(true);
      setUploadError(null);

      try {
        const blob = await upload(file.name, file, {
          access: 'public',
          handleUploadUrl: '/api/library/audio/upload-token',
        });
        const response = await fetch('/api/library/audio/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            releaseId: asset.id,
            blobUrl: blob.url,
            blobPathname: blob.pathname,
            fileName: file.name,
            fileMimeType: file.type,
            fileSizeBytes: file.size,
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          readonly previewUrl?: string;
          readonly error?: string;
        };

        if (!response.ok || !body.previewUrl) {
          throw new Error(body.error ?? 'Audio upload failed');
        }

        onUploaded(asset.id, body.previewUrl);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Audio upload failed';
        setUploadError(message);
        toast.error(message);
      } finally {
        setUploading(false);
        if (inputRef.current) {
          inputRef.current.value = '';
        }
      }
    },
    [asset.id, onUploaded]
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        uploadFile(file).catch(() => {});
      }
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) {
        uploadFile(file).catch(() => {});
      }
    },
    [uploadFile]
  );

  return (
    <div>
      <button
        type='button'
        onClick={() => inputRef.current?.click()}
        onDragEnter={event => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={event => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={event => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={handleDrop}
        disabled={uploading}
        tabIndex={disabledTabIndex}
        data-testid='library-audio-dropzone'
        className={cn(
          'system-b-library-dropzone flex w-full flex-col items-center justify-center px-3 py-4 text-center',
          isDragging && 'system-b-library-dropzone--dragging',
          !uploading &&
            'system-b-library-dropzone--interactive focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface)'
        )}
        aria-busy={uploading || undefined}
      >
        {uploading ? (
          <Loader2
            className='h-5 w-5 animate-spin text-secondary-token motion-reduce:animate-none'
            aria-hidden='true'
            strokeWidth={2.25}
          />
        ) : (
          <Upload
            className='h-5 w-5 text-tertiary-token'
            aria-hidden='true'
            strokeWidth={2.25}
          />
        )}
        <span className='system-b-library-audio-label mt-2 font-medium text-primary-token'>
          {uploading ? 'Uploading audio' : 'Drop audio'}
        </span>
        <span className='system-b-library-audio-hint mt-1 leading-4'>
          MP3, WAV, FLAC, AIFF, AAC, or M4A. Max 150 MB.
        </span>
      </button>
      <input
        ref={inputRef}
        type='file'
        accept={LIBRARY_AUDIO_ACCEPT}
        onChange={handleInputChange}
        disabled={uploading}
        tabIndex={disabledTabIndex}
        className='sr-only'
        aria-label={`Upload audio for ${asset.title}`}
      />
      <output className='system-b-library-audio-output min-h-5 pt-1.5'>
        {uploadError ? <p className='text-error'>{uploadError}</p> : null}
      </output>
    </div>
  );
}

function LibraryAudioPanel({
  asset,
  isPreviewPlaying,
  onTogglePreview,
  onUploaded,
  disabledTabIndex,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly isPreviewPlaying: boolean;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly onUploaded: (assetId: string, previewUrl: string) => void;
  readonly disabledTabIndex?: number;
}) {
  return (
    <div className='mt-4 border-t border-subtle pt-3'>
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
      {asset.previewUrl ? (
        <div
          className='system-b-library-audio-ready flex items-center gap-3 px-3 py-3'
          data-testid='library-audio-ready'
        >
          <span className='system-b-library-audio-icon grid h-8 w-8 shrink-0 place-items-center'>
            <FileAudio2 className='h-4 w-4' strokeWidth={2.25} />
          </span>
          <div className='min-w-0'>
            <p className='system-b-library-audio-label truncate font-medium text-primary-token'>
              Audio attached
            </p>
            <p className='system-b-library-audio-hint mt-0.5 leading-4'>
              Preview playback is available in the persistent player.
            </p>
          </div>
        </div>
      ) : (
        <LibraryAudioDropzone
          asset={asset}
          onUploaded={onUploaded}
          disabledTabIndex={disabledTabIndex}
        />
      )}
    </div>
  );
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
          <div className='flex h-full min-h-0 flex-col'>
            <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b border-subtle px-3'>
              <span className='system-b-library-drawer-kicker min-w-0 truncate'>
                {isMerch ? 'Merch' : 'Release'}
              </span>
              <div className='flex shrink-0 items-center gap-1'>
                <PreviewActionButton
                  asset={current}
                  isPreviewPlaying={isPreviewPlaying}
                  onTogglePreview={onTogglePreview}
                  compact
                  disabledTabIndex={closedTabIndex}
                  reserveSpace
                />
                <Link
                  href={current.primaryActionHref ?? current.smartLinkPath}
                  {...closedInteractiveProps}
                  aria-label={`Open ${current.title}`}
                  className={cn(
                    'system-b-library-icon-button system-b-library-icon-button--bordered grid h-7 w-7 place-items-center',
                    LIBRARY_ICON_FOCUS_CLASS
                  )}
                >
                  <ExternalLink className='h-3.5 w-3.5' />
                </Link>
                <button
                  type='button'
                  onClick={onClose}
                  aria-label='Close asset details'
                  {...closedInteractiveProps}
                  className={cn(
                    'system-b-library-icon-button grid h-7 w-7 place-items-center',
                    LIBRARY_ICON_FOCUS_CLASS
                  )}
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              </div>
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto p-3'>
              <div className='system-b-library-drawer-artwork overflow-hidden'>
                <div className='mx-auto aspect-square w-full max-w-80'>
                  <Artwork asset={current} size='drawer' />
                </div>
              </div>

              <div className='mt-3'>
                <h2 className='system-b-library-drawer-title'>
                  {current.title}
                </h2>
                <p className='system-b-library-drawer-artist mt-1'>
                  {current.artist}
                </p>
              </div>

              <div className='mt-3 flex flex-wrap gap-1.5'>
                <span
                  className={cn(
                    'system-b-library-status-pill inline-flex h-6 items-center border px-2',
                    releaseStatusClasses(current.status)
                  )}
                >
                  {formatLibraryStatus(current)}
                </span>
                {current.assetKinds.map(kind => (
                  <AssetKindPill key={kind} kind={kind} />
                ))}
              </div>

              <div className='mt-4 flex flex-wrap gap-1.5'>
                <Link
                  href={current.primaryActionHref ?? current.smartLinkPath}
                  {...closedInteractiveProps}
                  className={cn(
                    'system-b-library-action system-b-library-action--standard inline-flex items-center gap-1.5 border border-subtle',
                    LIBRARY_BUTTON_FOCUS_CLASS
                  )}
                >
                  {current.primaryActionLabel ?? 'Open Release'}
                  <ExternalLink className='h-3 w-3' />
                </Link>
              </div>

              {isMerch ? (
                <div className='system-b-library-drawer-panel mt-4 px-3 py-3'>
                  <div className='system-b-library-drawer-panel-heading mb-2 flex items-center gap-2 font-semibold text-primary-token'>
                    <Shirt className='h-3.5 w-3.5 text-tertiary-token' />
                    Merch
                  </div>
                  <p className='system-b-library-drawer-panel-copy leading-5 text-secondary-token'>
                    {current.description ?? 'Merch card saved from chat.'}
                  </p>
                </div>
              ) : (
                <LibraryAudioPanel
                  asset={current}
                  isPreviewPlaying={isPreviewPlaying}
                  onTogglePreview={onTogglePreview}
                  onUploaded={onAudioUploaded}
                  disabledTabIndex={closedTabIndex}
                />
              )}

              <dl className='mt-4'>
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
                    <MetadataRow label='Tracks' value={current.trackCount} />
                    <MetadataRow
                      label='Duration'
                      value={formatLibraryDuration(current.totalDurationMs)}
                    />
                  </>
                )}
                {!isMerch ? (
                  <>
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
                      value={current.label ?? current.distributor ?? 'No Label'}
                    />
                    <MetadataRow label='UPC' value={current.upc ?? 'No UPC'} />
                    <MetadataRow
                      label='Pitch Targets'
                      value={current.targetPlaylistCount}
                    />
                  </>
                ) : null}
              </dl>

              {!isMerch ? (
                <div className='mt-4 border-t border-subtle pt-3'>
                  <h3 className='system-b-library-audio-heading font-semibold text-primary-token'>
                    Providers
                  </h3>
                  {current.providers.length > 0 ? (
                    <div className='mt-2 space-y-1'>
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
                          <Music2 className='h-3.5 w-3.5 text-tertiary-token' />
                          <span className='min-w-0 flex-1 truncate'>
                            {provider.label}
                          </span>
                          <ExternalLink className='h-3 w-3 text-tertiary-token' />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className='system-b-library-provider-empty mt-2 leading-5 text-secondary-token'>
                      No provider links are connected for this release yet.
                    </p>
                  )}
                </div>
              ) : null}
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
  const viewLabel = view === 'grid' ? 'Grid' : 'List';
  const idleSummary = `${SORT_LABELS[sort]} - ${viewLabel}`;
  const playbackSummary = activePreviewTitle
    ? `Playing ${activePreviewTitle}`
    : idleSummary;

  return (
    <div className='system-b-library-status-bar hidden h-8 shrink-0 items-center justify-between gap-3 border-t border-subtle px-3 sm:flex'>
      <span className='min-w-0 truncate'>
        {visibleCount} of {totalCount} Items
      </span>
      <span className='min-w-0 truncate text-right'>{playbackSummary}</span>
    </div>
  );
}

export function LibrarySurface({
  assets,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const [audioOverrides, setAudioOverrides] = useState<Record<string, string>>(
    {}
  );
  const [preset, setPreset] = useState<LibraryPresetId>(() =>
    parseLibraryViewParam(searchParams.get('view'))
  );
  const [filters, setFilters] = useState<LibraryFilters>(() => emptyFilters());
  const [sort, setSort] = useState<LibrarySortKey>('releaseDate');
  const [view, setView] = useState<LibraryViewMode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const isDesktopLayout = useBreakpoint('lg');
  const deferredFilters = useDeferredValue(filters);
  const deferredPreset = useDeferredValue(preset);
  const deferredPills = useDeferredValue(pills);
  const deferredSort = useDeferredValue(sort);

  useEffect(() => {
    setPreset(parseLibraryViewParam(searchParams.get('view')));
  }, [searchParams]);

  const effectiveAssets = useMemo<readonly LibraryReleaseAsset[]>(
    () =>
      assets.map((asset): LibraryReleaseAsset => {
        const previewUrl = audioOverrides[asset.id];
        if (!previewUrl) return asset;
        const assetKinds: readonly LibraryAssetKind[] =
          asset.assetKinds.includes('preview')
            ? asset.assetKinds
            : [...asset.assetKinds, 'preview'];

        return {
          ...asset,
          previewUrl,
          assetKinds,
        };
      }),
    [assets, audioOverrides]
  );

  const visibleAssets = useMemo(() => {
    const presetPredicate =
      PRESETS.find(item => item.id === deferredPreset)?.predicate ??
      (() => true);

    return effectiveAssets
      .filter(presetPredicate)
      .filter(asset => assetMatchesFilters(asset, deferredFilters))
      .filter(asset => assetMatchesPills(asset, deferredPills))
      .toSorted(compareAssets(deferredSort));
  }, [
    deferredFilters,
    deferredPills,
    deferredPreset,
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

  function resetView() {
    handlePresetChange('all');
    setFilters(emptyFilters());
    setPills([]);
  }

  function openAsset(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  const getContextMenuItems = useCallback<LibraryContextMenuBuilder>(
    asset => {
      const href = asset.primaryActionHref ?? asset.smartLinkPath;
      const items: ContextMenuItemType[] = [
        {
          id: 'inspect',
          label: `Inspect ${asset.title}`,
          icon: <ExternalLink className='h-3.5 w-3.5' />,
          onClick: () => {
            setSelectedId(asset.id);
            setDrawerOpen(true);
          },
        },
        {
          id: 'open',
          label:
            asset.primaryActionLabel ??
            (getLibraryItemKind(asset) === 'merch'
              ? 'Open Merch'
              : 'Open Release'),
          icon: <ExternalLink className='h-3.5 w-3.5' />,
          onClick: () => router.push(href),
        },
        {
          id: 'copy-title',
          label: 'Copy Title',
          icon: <Copy className='h-3.5 w-3.5' />,
          onClick: () => {
            void globalThis.navigator?.clipboard?.writeText(asset.title);
          },
        },
      ];

      if (asset.previewUrl) {
        items.splice(1, 0, {
          id: 'play-preview',
          label:
            playingPreviewId === asset.id ? 'Pause Preview' : 'Play Preview',
          icon: <PlayCircle className='h-3.5 w-3.5' />,
          onClick: () => handleTogglePreview(asset),
        });
      }

      return items;
    },
    [handleTogglePreview, playingPreviewId, router]
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
        filters={filters}
        onFilters={setFilters}
        onClearFilters={() => setFilters(emptyFilters())}
      />
    ),
    [effectiveAssets, filters]
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
                onSelect={openAsset}
                onTogglePreview={handleTogglePreview}
                getContextMenuItems={getContextMenuItems}
              />
            ) : (
              <LibraryDataTable
                assets={visibleAssets}
                selectedId={selectedId}
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
        />
      </div>
    </PageShell>
  );
}
