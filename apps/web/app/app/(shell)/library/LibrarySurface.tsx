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
  Upload,
  Video,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import type { FilterPill } from '@/components/shell/pill-search.types';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterHeaderSearch } from '@/contexts/HeaderActionsContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import {
  formatLibraryDuration,
  formatLibraryReleaseDate,
  type LibraryAssetKind,
  type LibraryReleaseAsset,
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
type LibraryPresetId = 'all' | 'ready' | 'needsAssets' | 'scheduled';
type ArtworkSize = 'card' | 'row' | 'drawer';
type LibraryPreviewToggle = (
  asset: LibraryReleaseAsset,
  event?: MouseEvent<HTMLElement>
) => void;
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
    label: 'All Releases',
    description: 'Everything in the connected catalog',
    predicate: () => true,
  },
  {
    id: 'ready',
    label: 'Ready Assets',
    description: 'Artwork plus at least one provider link',
    predicate: asset => asset.hasArtwork && asset.providerCount > 0,
  },
  {
    id: 'needsAssets',
    label: 'Needs Assets',
    description: 'Missing artwork, previews, lyrics, or provider links',
    predicate: asset =>
      !asset.hasArtwork ||
      !asset.previewUrl ||
      !asset.hasLyrics ||
      asset.providerCount === 0,
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    description: 'Upcoming catalog work',
    predicate: asset => asset.status === 'scheduled',
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

function formatReleaseStatus(status: LibraryReleaseAsset['status']): string {
  return capitalizeFirst(status);
}

function releaseStatusClasses(status: LibraryReleaseAsset['status']): string {
  if (status === 'released') {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }
  if (status === 'scheduled') {
    return 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
  }
  return 'border-subtle bg-surface-1 text-tertiary-token';
}

function releaseStatusDotClasses(
  status: LibraryReleaseAsset['status']
): string {
  if (status === 'released') return 'bg-emerald-400';
  if (status === 'scheduled') return 'bg-cyan-300';
  return 'bg-white/35';
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
      <span className='group/artwork relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-black'>
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
              'absolute inset-0 grid place-items-center bg-black/55 text-white transition-opacity duration-subtle ease-subtle focus-visible:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55',
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
        <span className='block truncate text-sm font-medium text-primary-token'>
          {asset.title}
        </span>
        <span className='mt-0.5 block truncate text-xs text-tertiary-token'>
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
        'inline-flex h-6 w-fit items-center rounded-md border px-2 text-[11px] leading-4',
        releaseStatusClasses(asset.status)
      )}
    >
      {formatReleaseStatus(asset.status)}
    </span>
  );
});

const ProvidersCell = memo(function ProvidersCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span className='inline-flex h-6 min-w-7 items-center justify-center rounded-md border border-subtle bg-surface-0 px-2 text-xs tabular-nums text-secondary-token'>
      {formatCompactCount(asset.providerCount)}
    </span>
  );
});

const libraryColumnHelper = createColumnHelper<LibraryReleaseAsset>();

const LIBRARY_TABLE_COLUMNS = [
  libraryColumnHelper.accessor('title', {
    id: 'release',
    header: 'Release',
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
      <span className='truncate text-xs text-tertiary-token'>
        {formatReleaseType(row.original.releaseType)}
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
      <span className='block whitespace-nowrap text-right text-xs tabular-nums text-tertiary-token'>
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
            <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              <span
                className='inline-block h-3 w-36 rounded-sm skeleton motion-reduce:animate-none align-middle'
                aria-hidden='true'
              />
            </span>
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

function LibraryRail({
  assets,
  preset,
  filters,
  onPreset,
  onFilters,
  onClearFilters,
  className,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly preset: LibraryPresetId;
  readonly filters: LibraryFilters;
  readonly onPreset: (preset: LibraryPresetId) => void;
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
      aria-label='Library navigation'
      className={cn('flex min-h-0 flex-col bg-surface-0 p-2.5', className)}
    >
      <div className='px-1.5 pb-2'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-xs font-semibold text-primary-token'>Views</p>
          <span className='text-2xs tabular-nums text-tertiary-token'>
            {assets.length}
          </span>
        </div>
        <div className='mt-1.5 space-y-px'>
          {PRESETS.map(view => {
            const active = preset === view.id;
            const count = assets.filter(view.predicate).length;
            return (
              <button
                key={view.id}
                type='button'
                onClick={() => onPreset(view.id)}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none',
                  active
                    ? 'bg-surface-1 text-primary-token'
                    : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
                )}
              >
                <span className='min-w-0 flex-1 truncate'>{view.label}</span>
                <span className='text-2xs tabular-nums text-tertiary-token'>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='flex items-center justify-between gap-2 pb-1 pt-2'>
          <p className='text-xs font-semibold text-primary-token'>Filters</p>
          {hasActiveFilters(filters) ? (
            <button
              type='button'
              onClick={onClearFilters}
              className='rounded px-1.5 py-0.5 text-2xs text-tertiary-token transition-colors duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token'
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
        className='flex h-6 w-full items-center justify-between rounded-md px-1 text-[11px] font-medium text-tertiary-token transition-colors duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token'
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
        'flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface) outline-none',
        active
          ? 'bg-surface-1 text-primary-token'
          : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
      )}
    >
      {Icon ? (
        <Icon className='h-3 w-3 shrink-0 text-tertiary-token' />
      ) : (
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClassName)}
          aria-hidden='true'
        />
      )}
      <span className='min-w-0 flex-1 truncate text-left'>{label}</span>
      <span className='text-2xs tabular-nums text-tertiary-token'>{count}</span>
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
        <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>
          {visibleCount}
          {visibleCount === totalCount ? '' : ` of ${totalCount}`} visible
        </span>
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
    <span className='inline-flex h-6 items-center gap-1 rounded-md bg-surface-1 px-2 text-xs text-secondary-token'>
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
        'group relative min-w-0 overflow-hidden rounded-lg border bg-surface-0 transition-[border-color,background-color] duration-subtle ease-subtle',
        selected
          ? 'border-(--linear-border-focus) bg-surface-1'
          : 'border-subtle hover:border-default'
      )}
    >
      <button
        type='button'
        onClick={onSelect}
        aria-label={`Inspect ${asset.title}`}
        className={cn(
          'flex h-full w-full flex-col text-left transition-[background-color,box-shadow] duration-subtle ease-subtle',
          LIBRARY_CARD_FOCUS_CLASS
        )}
      >
        <div className='relative aspect-square overflow-hidden bg-black'>
          <Artwork asset={asset} />
          <span
            className={cn(
              'absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 shadow-[0_6px_16px_rgba(0,0,0,0.18)]',
              releaseStatusClasses(asset.status)
            )}
          >
            {formatReleaseStatus(asset.status)}
          </span>
        </div>
        <div className='min-w-0 p-3'>
          <div className='flex min-w-0 items-start justify-between gap-2'>
            <div className='min-w-0'>
              <h2 className='truncate text-sm font-semibold text-primary-token'>
                {asset.title}
              </h2>
              <p className='mt-0.5 truncate text-xs text-secondary-token'>
                {asset.artist}
              </p>
            </div>
            <span className='shrink-0 text-2xs tabular-nums text-tertiary-token'>
              {formatCompactCount(asset.providerCount)}
            </span>
          </div>
          <div className='mt-2 flex min-w-0 items-center gap-1.5 text-xs text-tertiary-token'>
            <Disc3 className='h-3 w-3 shrink-0' />
            <span>{formatReleaseType(asset.releaseType)}</span>
            <span className='opacity-50'>.</span>
            <span>{asset.trackCount} Tracks</span>
          </div>
          <div className='mt-3 flex flex-wrap gap-1.5'>
            {asset.assetKinds.slice(0, 3).map(kind => (
              <AssetKindPill key={kind} kind={kind} />
            ))}
            {asset.assetKinds.length > 3 ? (
              <span className='inline-flex h-6 items-center rounded-md bg-surface-1 px-2 text-xs text-tertiary-token'>
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
            'absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/60 text-white shadow-[0_8px_20px_rgba(0,0,0,0.22)] backdrop-blur transition-[background-color,border-color,opacity] duration-subtle ease-subtle hover:border-white/35 hover:bg-black/70',
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
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview: LibraryPreviewToggle;
}) {
  return (
    <div className='grid gap-2.5 px-2.5 pb-2.5 pt-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
      {assets.map(asset => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedId === asset.id}
          isPreviewActive={activePreviewId === asset.id}
          isPreviewPlaying={playingPreviewId === asset.id}
          onSelect={() => onSelect(asset.id)}
          onTogglePreview={onTogglePreview}
        />
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
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly playingPreviewId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview: LibraryPreviewToggle;
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

  return (
    <LibraryPreviewContext.Provider value={previewContext}>
      <UnifiedTable<LibraryReleaseAsset>
        data={tableData}
        columns={LIBRARY_TABLE_COLUMNS}
        onRowClick={asset => onSelect(asset.id)}
        getRowId={getRowId}
        getRowTestId={getRowTestId}
        rowSelection={rowSelection}
        enableVirtualization={assets.length >= 20}
        rowHeight={LIBRARY_TABLE_ROW_HEIGHT}
        minWidth={LIBRARY_TABLE_MIN_WIDTH}
        hideHeader
        className='text-app text-primary-token'
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
        title='No Release Assets'
        description='Releases and artwork will appear here after your catalog is connected.'
        className='m-3 min-h-[360px]'
        action={
          <Link
            href={APP_ROUTES.RELEASES}
            className={cn(
              'inline-flex h-8 items-center rounded-md border border-subtle bg-surface-0 px-3 text-sm font-medium text-primary-token transition-[background-color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-1',
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
      description='No release assets match the selected view or filters.'
      className='m-3 min-h-[300px]'
      action={
        <button
          type='button'
          onClick={onReset}
          className={cn(
            'inline-flex h-8 items-center rounded-md border border-subtle bg-surface-0 px-3 text-sm font-medium text-primary-token transition-[background-color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-1',
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
    <div className='grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t border-subtle py-2 text-xs'>
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
        'inline-flex items-center justify-center gap-1.5 rounded-md border border-subtle bg-surface-1 text-xs font-medium text-primary-token transition-[background-color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-2',
        compact ? 'h-7 w-7 px-0' : 'h-8 px-3',
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
          'flex min-h-[118px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-subtle bg-surface-0 px-3 py-4 text-center transition-[background-color,border-color,color] duration-subtle ease-subtle',
          isDragging &&
            'border-(--linear-border-focus) bg-[color-mix(in_oklab,var(--linear-border-focus)_8%,var(--linear-bg-surface-0))]',
          !uploading &&
            'hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface)'
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
        <span className='mt-2 text-xs font-medium text-primary-token'>
          {uploading ? 'Uploading audio' : 'Drop audio'}
        </span>
        <span className='mt-1 text-2xs leading-4 text-tertiary-token'>
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
      <output className='min-h-5 pt-1.5 text-2xs'>
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
          <h3 className='truncate text-xs font-semibold text-primary-token'>
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
          className='flex min-h-[118px] items-center gap-3 rounded-lg border border-subtle bg-surface-0 px-3 py-3'
          data-testid='library-audio-ready'
        >
          <span className='grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-1 text-secondary-token'>
            <FileAudio2 className='h-4 w-4' strokeWidth={2.25} />
          </span>
          <div className='min-w-0'>
            <p className='truncate text-xs font-medium text-primary-token'>
              Audio attached
            </p>
            <p className='mt-0.5 text-2xs leading-4 text-tertiary-token'>
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
}: {
  readonly asset: LibraryReleaseAsset | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly isDesktopLayout: boolean;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly onAudioUploaded: (assetId: string, previewUrl: string) => void;
}) {
  const [stickyAsset, setStickyAsset] = useState<LibraryReleaseAsset | null>(
    asset
  );

  useEffect(() => {
    if (asset) setStickyAsset(asset);
  }, [asset]);

  const current = asset ?? stickyAsset;
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
        'h-full min-h-0 overflow-hidden border-l border-subtle bg-surface-0 transition-[opacity,transform] duration-cinematic ease-cinematic',
        isDesktopLayout
          ? 'static z-auto rounded-none border-y-0 border-r-0 shadow-none'
          : 'fixed inset-x-3 bottom-20 top-16 z-40 rounded-lg border shadow-[0_18px_48px_rgba(0,0,0,0.28)]',
        open ? 'translate-y-0 opacity-100' : closedDrawerClassName
      )}
      data-testid='library-asset-drawer'
    >
      {current ? (
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex h-10 shrink-0 items-center justify-between gap-2 border-b border-subtle px-3'>
            <span className='min-w-0 truncate text-xs font-semibold text-primary-token'>
              Release
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
                href={current.smartLinkPath}
                {...closedInteractiveProps}
                aria-label={`Open ${current.title}`}
                className={cn(
                  'grid h-7 w-7 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary-token transition-[background-color,border-color,color,box-shadow] duration-subtle hover:border-default hover:bg-surface-2 hover:text-primary-token',
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
                  'grid h-7 w-7 place-items-center rounded-md text-tertiary-token transition-[background-color,color,box-shadow] duration-subtle hover:bg-surface-1 hover:text-primary-token',
                  LIBRARY_ICON_FOCUS_CLASS
                )}
              >
                <X className='h-3.5 w-3.5' />
              </button>
            </div>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto p-3'>
            <div className='overflow-hidden rounded-lg bg-black'>
              <div className='mx-auto aspect-square w-full max-w-80'>
                <Artwork asset={current} size='drawer' />
              </div>
            </div>

            <div className='mt-3'>
              <h2 className='text-[18px] font-semibold leading-6 text-primary-token'>
                {current.title}
              </h2>
              <p className='mt-1 text-sm text-secondary-token'>
                {current.artist}
              </p>
            </div>

            <div className='mt-3 flex flex-wrap gap-1.5'>
              <span
                className={cn(
                  'inline-flex h-6 items-center rounded-md border px-2 text-xs',
                  releaseStatusClasses(current.status)
                )}
              >
                {formatReleaseStatus(current.status)}
              </span>
              {current.assetKinds.map(kind => (
                <AssetKindPill key={kind} kind={kind} />
              ))}
            </div>

            <div className='mt-4 flex flex-wrap gap-1.5'>
              <Link
                href={current.smartLinkPath}
                {...closedInteractiveProps}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-xs font-medium text-primary-token transition-[background-color,border-color,box-shadow] duration-subtle hover:border-default hover:bg-surface-2',
                  LIBRARY_BUTTON_FOCUS_CLASS
                )}
              >
                Open Release
                <ExternalLink className='h-3 w-3' />
              </Link>
            </div>

            <LibraryAudioPanel
              asset={current}
              isPreviewPlaying={isPreviewPlaying}
              onTogglePreview={onTogglePreview}
              onUploaded={onAudioUploaded}
              disabledTabIndex={closedTabIndex}
            />

            <dl className='mt-4'>
              <MetadataRow
                label='Release Date'
                value={formatLibraryReleaseDate(current.releaseDate)}
              />
              <MetadataRow
                label='Type'
                value={formatReleaseType(current.releaseType)}
              />
              <MetadataRow label='Tracks' value={current.trackCount} />
              <MetadataRow
                label='Duration'
                value={formatLibraryDuration(current.totalDurationMs)}
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
                value={current.label ?? current.distributor ?? 'No Label'}
              />
              <MetadataRow label='UPC' value={current.upc ?? 'No UPC'} />
              <MetadataRow
                label='Pitch Targets'
                value={current.targetPlaylistCount}
              />
            </dl>

            <div className='mt-4 border-t border-subtle pt-3'>
              <h3 className='text-xs font-semibold text-primary-token'>
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
                        'flex h-8 items-center gap-2 rounded-md px-2 text-xs text-secondary-token transition-[background-color,color,box-shadow] duration-subtle hover:bg-surface-1 hover:text-primary-token',
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
                <p className='mt-2 text-xs leading-5 text-secondary-token'>
                  No provider links are connected for this release yet.
                </p>
              )}
            </div>
          </div>
        </div>
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
    <div className='hidden h-8 shrink-0 items-center justify-between gap-3 border-t border-subtle bg-(--linear-app-content-surface) px-3 text-[11px] text-tertiary-token sm:flex'>
      <span className='min-w-0 truncate'>
        {visibleCount} of {totalCount} Releases
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
  const { playbackState, toggleTrack } = useTrackAudioPlayer();
  const [audioOverrides, setAudioOverrides] = useState<Record<string, string>>(
    {}
  );
  const [preset, setPreset] = useState<LibraryPresetId>('all');
  const [filters, setFilters] = useState<LibraryFilters>(() => emptyFilters());
  const [sort, setSort] = useState<LibrarySortKey>('releaseDate');
  const [view, setView] = useState<LibraryViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const isDesktopLayout = useBreakpoint('lg');

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
      PRESETS.find(item => item.id === preset)?.predicate ?? (() => true);

    return effectiveAssets
      .filter(presetPredicate)
      .filter(asset => assetMatchesFilters(asset, filters))
      .filter(asset => assetMatchesPills(asset, pills))
      .toSorted(compareAssets(sort));
  }, [effectiveAssets, filters, pills, preset, sort]);

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

  function resetView() {
    setPreset('all');
    setFilters(emptyFilters());
    setPills([]);
  }

  function openAsset(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

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
        preset={preset}
        filters={filters}
        onPreset={setPreset}
        onFilters={setFilters}
        onClearFilters={() => setFilters(emptyFilters())}
      />
    ),
    [effectiveAssets, filters, preset]
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
    ? `minmax(16rem,17.5rem) minmax(0,1fr) ${drawerColumnWidth}`
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
        {isDesktopLayout
          ? cloneElement(libraryRail, {
              className:
                'hidden min-h-0 border-r border-subtle lg:flex lg:h-full',
            })
          : null}
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
              />
            ) : (
              <LibraryDataTable
                assets={visibleAssets}
                selectedId={selectedId}
                playingPreviewId={playingPreviewId}
                onSelect={openAsset}
                onTogglePreview={handleTogglePreview}
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
        />
      </div>
    </PageShell>
  );
}
