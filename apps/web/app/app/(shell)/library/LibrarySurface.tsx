'use client';

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
  type LucideIcon,
  Music2,
  PlayCircle,
  Search,
  Video,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { OPEN_COMMAND_PALETTE_EVENT } from '@/components/organisms/command-palette-events';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import { Tooltip } from '@/components/shell/Tooltip';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterShellSidebarOverride } from '@/contexts/ShellSidebarOverrideContext';
import {
  getArtworkFallbackAccentStyle,
  getArtworkFallbackSurfaceStyle,
} from '@/lib/artwork-fallback';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import {
  formatLibraryDuration,
  formatLibraryReleaseDate,
  type LibraryAssetKind,
  type LibraryReleaseAsset,
} from './library-data';

const LIBRARY_LOADING_PLACEHOLDERS = [
  'library-loading-release-1',
  'library-loading-release-2',
  'library-loading-release-3',
  'library-loading-release-4',
  'library-loading-release-5',
  'library-loading-release-6',
] as const;

type LibraryViewMode = 'grid' | 'list';
type LibrarySortKey = 'releaseDate' | 'title' | 'status' | 'providers';
type LibraryPresetId = 'all' | 'ready' | 'needsAssets' | 'scheduled';
type ArtworkSize = 'card' | 'row' | 'drawer';

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
        'relative overflow-hidden border border-subtle bg-surface-1 text-white/25',
        sizeClasses[size]
      )}
      data-artwork-fallback='true'
      style={getArtworkFallbackSurfaceStyle(asset.title)}
    >
      <div className='absolute inset-0 grid place-items-center'>
        <Disc3
          className={cn(size === 'row' ? 'h-4 w-4' : 'h-[18%] w-[18%]')}
          strokeWidth={1.85}
        />
      </div>
      <span
        aria-hidden='true'
        className='absolute inset-x-0 bottom-0 h-1'
        style={getArtworkFallbackAccentStyle(asset.title)}
      />
      <span
        aria-hidden='true'
        className='absolute inset-[1px] rounded-[3px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
      />
    </div>
  );
}

export function LibraryLoadingState() {
  return (
    <main
      aria-busy='true'
      aria-label='Loading Library'
      className='h-full overflow-hidden px-4 py-4 sm:px-5 lg:px-6'
    >
      <div className='mx-auto grid h-full max-w-[1440px] overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-card'>
        <div className='flex min-w-0 flex-col'>
          <div className='border-b border-subtle p-3'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='space-y-2'>
                <div className='h-4 w-56 max-w-[72vw] rounded-md bg-surface-0' />
                <div className='h-4 w-32 rounded-md bg-surface-0' />
              </div>
              <div className='h-8 w-full rounded-md bg-surface-0 sm:w-80' />
            </div>
          </div>
          <div className='grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3'>
            {LIBRARY_LOADING_PLACEHOLDERS.map(placeholderId => (
              <div
                key={placeholderId}
                className='min-w-0 rounded-lg border border-subtle bg-surface-0 p-2'
              >
                <div className='aspect-square rounded-md bg-surface-1' />
                <div className='space-y-2 px-1 py-3'>
                  <div className='h-4 w-3/4 rounded-md bg-surface-1' />
                  <div className='h-3 w-1/2 rounded-md bg-surface-1' />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
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
  const assetKinds = uniqueSorted(
    assets.flatMap(asset => asset.assetKinds)
  ) as LibraryAssetKind[];
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
  const openCommandPalette = () => {
    globalThis.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
  };

  return (
    <nav
      aria-label='Library navigation'
      className={cn('flex min-h-0 flex-col bg-surface-0 p-2.5', className)}
    >
      <div className='px-1.5 pb-2'>
        <button
          type='button'
          onClick={openCommandPalette}
          className='flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          <Search className='h-3.5 w-3.5 shrink-0 text-sidebar-item-icon' />
          <span className='min-w-0 flex-1 truncate'>Search</span>
          <span className='text-2xs text-tertiary-token'>Cmd K</span>
        </button>
      </div>

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
                  'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] transition-colors duration-subtle',
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
              className='rounded px-1.5 py-0.5 text-2xs text-tertiary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token'
            >
              Clear {activeFilterCount}
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
        className='flex h-6 w-full items-center justify-between rounded-md px-1 text-[11px] font-medium text-tertiary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token'
      >
        <span>{label}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform duration-subtle',
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
        'flex h-7 w-full items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-subtle',
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
        <button
          type='button'
          className='inline-flex h-8 items-center gap-1.5 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2.5 text-[12px] text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          <ArrowUpDown className='h-3.5 w-3.5' strokeWidth={2.25} />
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
    <div className='inline-flex h-8 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] p-0.5'>
      <Tooltip label='Grid View' side='bottom'>
        <button
          type='button'
          onClick={() => onView('grid')}
          aria-label='Grid view'
          className={cn(
            'grid h-7 w-8 place-items-center rounded-[5px] transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
            view === 'grid'
              ? 'bg-surface-2 text-primary-token'
              : 'text-tertiary-token hover:text-primary-token'
          )}
        >
          <Grid3x3 className='h-3.5 w-3.5' />
        </button>
      </Tooltip>
      <Tooltip label='List View' side='bottom'>
        <button
          type='button'
          onClick={() => onView('list')}
          aria-label='List view'
          className={cn(
            'grid h-7 w-8 place-items-center rounded-[5px] transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
            view === 'list'
              ? 'bg-surface-2 text-primary-token'
              : 'text-tertiary-token hover:text-primary-token'
          )}
        >
          <LayoutList className='h-3.5 w-3.5' />
        </button>
      </Tooltip>
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
}: {
  readonly sort: LibrarySortKey;
  readonly onSort: (sort: LibrarySortKey) => void;
  readonly view: LibraryViewMode;
  readonly onView: (view: LibraryViewMode) => void;
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly mobileFiltersOpen: boolean;
  readonly onToggleMobileFilters: () => void;
}) {
  return (
    <div className='border-b border-subtle bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] p-3'>
      <div className='flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
        <div className='min-w-0'>
          <p className='text-sm text-secondary-token'>
            Release assets from your connected catalog.
          </p>
          <p className='mt-0.5 text-xs text-tertiary-token'>
            {visibleCount}
            {visibleCount === totalCount ? '' : ` of ${totalCount}`} visible
          </p>
        </div>
        <div className='flex min-w-0 flex-wrap items-center justify-end gap-2'>
          <button
            type='button'
            onClick={onToggleMobileFilters}
            aria-expanded={mobileFiltersOpen}
            className='inline-flex h-8 items-center gap-1.5 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2.5 text-[12px] text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) lg:hidden'
          >
            <Filter className='h-3.5 w-3.5' />
            Filters
          </button>
          <SortDropdown sort={sort} onSort={onSort} />
          <ViewToggle view={view} onView={onView} />
        </div>
      </div>
    </div>
  );
}

function AssetKindPill({ kind }: { readonly kind: LibraryAssetKind }) {
  const Icon = ASSET_KIND_ICONS[kind];
  return (
    <span className='inline-flex h-6 items-center gap-1 rounded-md bg-surface-1 px-2 text-xs text-secondary-token'>
      <Icon className='h-3 w-3' strokeWidth={2.25} />
      {ASSET_KIND_LABELS[kind]}
    </span>
  );
}

function AssetCard({
  asset,
  selected,
  onSelect,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <article
      className={cn(
        'group relative min-w-0 overflow-hidden rounded-lg border bg-surface-0 transition-[border-color,background-color] duration-subtle',
        selected
          ? 'border-(--linear-border-focus) bg-surface-1'
          : 'border-subtle hover:border-default'
      )}
    >
      <button
        type='button'
        onClick={onSelect}
        className='flex h-full w-full flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)'
      >
        <div className='relative aspect-square overflow-hidden bg-black'>
          <Artwork asset={asset} />
          <span
            className={cn(
              'absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 shadow-[0_6px_16px_rgba(0,0,0,0.18)] backdrop-blur',
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
    </article>
  );
}

function AssetGrid({
  assets,
  selectedId,
  onSelect,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <div className='grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
      {assets.map(asset => (
        <AssetCard
          key={asset.id}
          asset={asset}
          selected={selectedId === asset.id}
          onSelect={() => onSelect(asset.id)}
        />
      ))}
    </div>
  );
}

function AssetList({
  assets,
  selectedId,
  onSelect,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <div className='p-2'>
      <div className='hidden grid-cols-[52px_minmax(0,1.4fr)_110px_92px_92px_96px] items-center gap-2 border-b border-subtle px-2 py-1.5 text-2xs font-medium text-tertiary-token md:grid'>
        <span />
        <span>Title</span>
        <span>Status</span>
        <span>Type</span>
        <span>Providers</span>
        <span className='text-right'>Release Date</span>
      </div>
      <div className='space-y-px'>
        {assets.map(asset => {
          const selected = selectedId === asset.id;
          return (
            <button
              type='button'
              key={asset.id}
              onClick={() => onSelect(asset.id)}
              className={cn(
                'grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-subtle focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) md:grid-cols-[52px_minmax(0,1.4fr)_110px_92px_92px_96px]',
                selected
                  ? 'bg-surface-1 text-primary-token'
                  : 'text-secondary-token hover:bg-surface-1 hover:text-primary-token'
              )}
            >
              <span className='overflow-hidden rounded-md bg-black'>
                <Artwork asset={asset} size='row' />
              </span>
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium text-primary-token'>
                  {asset.title}
                </span>
                <span className='mt-0.5 block truncate text-xs text-tertiary-token'>
                  {asset.artist}
                </span>
              </span>
              <span
                className={cn(
                  'hidden w-fit rounded-md border px-1.5 py-0.5 text-[11px] leading-4 md:inline-flex',
                  releaseStatusClasses(asset.status)
                )}
              >
                {formatReleaseStatus(asset.status)}
              </span>
              <span className='hidden truncate text-xs text-tertiary-token md:block'>
                {formatReleaseType(asset.releaseType)}
              </span>
              <span className='hidden text-xs tabular-nums text-tertiary-token md:block'>
                {asset.providerCount}
              </span>
              <span className='hidden text-right text-xs tabular-nums text-tertiary-token md:block'>
                {formatLibraryReleaseDate(asset.releaseDate)}
              </span>
              <span className='text-xs tabular-nums text-tertiary-token md:hidden'>
                {asset.providerCount}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyCatalog() {
  return (
    <main
      aria-label='Library'
      className='flex h-full min-h-[420px] items-center justify-center px-6'
      data-testid='library-surface'
    >
      <div className='max-w-sm text-center'>
        <div className='mx-auto mb-4 grid h-10 w-10 place-items-center rounded-md border border-subtle bg-surface-1 text-tertiary-token'>
          <Music2 className='h-4 w-4' strokeWidth={2.25} />
        </div>
        <h2 className='text-base font-semibold text-primary-token'>
          No Release Assets
        </h2>
        <p className='mt-2 text-sm leading-6 text-secondary-token'>
          Releases and artwork will appear here after your catalog is connected.
        </p>
        <Link
          href={APP_ROUTES.DASHBOARD_RELEASES}
          className='mt-5 inline-flex h-8 items-center rounded-md border border-subtle bg-surface-0 px-3 text-sm font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
        >
          Open Releases
        </Link>
      </div>
    </main>
  );
}

function NoResults({ onReset }: { readonly onReset: () => void }) {
  return (
    <div className='grid min-h-[300px] place-items-center px-6 text-center'>
      <div className='max-w-sm'>
        <h2 className='text-base font-semibold text-primary-token'>
          No Assets Match
        </h2>
        <p className='mt-2 text-sm leading-6 text-secondary-token'>
          No release assets match the selected view or filters.
        </p>
        <button
          type='button'
          onClick={onReset}
          className='mt-4 inline-flex h-8 items-center rounded-md border border-subtle bg-surface-0 px-3 text-sm font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
        >
          Reset View
        </button>
      </div>
    </div>
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

function AssetDrawer({
  asset,
  open,
  onClose,
}: {
  readonly asset: LibraryReleaseAsset | null;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const [stickyAsset, setStickyAsset] = useState<LibraryReleaseAsset | null>(
    asset
  );

  useEffect(() => {
    if (asset) setStickyAsset(asset);
  }, [asset]);

  const current = asset ?? stickyAsset;
  const closedInteractiveProps = open ? {} : { tabIndex: -1 };

  return (
    <aside
      aria-hidden={!open}
      inert={open ? undefined : true}
      className={cn(
        'overflow-hidden border-l border-subtle bg-surface-0 transition-[opacity,transform] duration-cinematic ease-cinematic',
        'fixed inset-x-3 bottom-3 top-16 z-40 rounded-lg border shadow-[0_18px_48px_rgba(0,0,0,0.28)] lg:static lg:z-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none',
        open
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-2 opacity-0 max-lg:hidden'
      )}
      data-testid='library-asset-drawer'
    >
      {current ? (
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex h-10 shrink-0 items-center justify-between border-b border-subtle px-3'>
            <span className='text-xs font-semibold text-primary-token'>
              Asset Details
            </span>
            <button
              type='button'
              onClick={onClose}
              aria-label='Close asset details'
              {...closedInteractiveProps}
              className='grid h-7 w-7 place-items-center rounded-md text-tertiary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
            >
              <X className='h-3.5 w-3.5' />
            </button>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto p-3'>
            <div className='overflow-hidden rounded-lg border border-subtle bg-black'>
              <div className='aspect-square'>
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
                className='inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-xs font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
              >
                Open Release
                <ExternalLink className='h-3 w-3' />
              </Link>
              {current.previewUrl ? (
                <a
                  href={current.previewUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  {...closedInteractiveProps}
                  className='inline-flex h-8 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-xs font-medium text-primary-token transition-[background-color,border-color] duration-subtle hover:border-default hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
                >
                  <PlayCircle className='h-3 w-3' />
                  Preview
                </a>
              ) : null}
            </div>

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
                      className='flex h-8 items-center gap-2 rounded-md px-2 text-xs text-secondary-token transition-colors duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
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

export function LibrarySurface({
  assets,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
}) {
  const [preset, setPreset] = useState<LibraryPresetId>('all');
  const [filters, setFilters] = useState<LibraryFilters>(() => emptyFilters());
  const [sort, setSort] = useState<LibrarySortKey>('releaseDate');
  const [view, setView] = useState<LibraryViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const visibleAssets = useMemo(() => {
    const presetPredicate =
      PRESETS.find(item => item.id === preset)?.predicate ?? (() => true);

    return assets
      .filter(presetPredicate)
      .filter(asset => assetMatchesFilters(asset, filters))
      .toSorted(compareAssets(sort));
  }, [assets, filters, preset, sort]);

  const selectedAsset =
    visibleAssets.find(asset => asset.id === selectedId) ?? null;

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
  }

  function openAsset(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  const sidebarNavigation = useMemo(
    () => (
      <LibraryRail
        assets={assets}
        preset={preset}
        filters={filters}
        onPreset={setPreset}
        onFilters={setFilters}
        onClearFilters={() => setFilters(emptyFilters())}
      />
    ),
    [assets, filters, preset]
  );

  const sidebarOverride = useMemo(
    () => ({
      key: 'library',
      backHref: APP_ROUTES.CHAT,
      backLabel: 'Back to App',
      content: sidebarNavigation,
    }),
    [sidebarNavigation]
  );

  useRegisterShellSidebarOverride(sidebarOverride);

  if (assets.length === 0) {
    return <EmptyCatalog />;
  }

  return (
    <main
      aria-label='Library'
      className='h-full overflow-hidden px-4 py-4 sm:px-5 lg:px-6'
      data-testid='library-surface'
    >
      <div className='mx-auto flex h-full max-w-[1440px] overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-card'>
        <section className='flex min-w-0 flex-1 flex-col overflow-hidden'>
          <LibraryToolbar
            sort={sort}
            onSort={setSort}
            view={view}
            onView={setView}
            visibleCount={visibleAssets.length}
            totalCount={assets.length}
            mobileFiltersOpen={mobileFiltersOpen}
            onToggleMobileFilters={() => setMobileFiltersOpen(value => !value)}
          />

          {mobileFiltersOpen ? (
            <LibraryRail
              assets={assets}
              preset={preset}
              filters={filters}
              onPreset={setPreset}
              onFilters={setFilters}
              onClearFilters={() => setFilters(emptyFilters())}
              className='max-h-[45svh] border-b border-subtle lg:hidden'
            />
          ) : null}

          <div
            className='grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_var(--library-drawer-width)]'
            style={
              {
                '--library-drawer-width': drawerOpen ? '360px' : '0px',
                transition:
                  'grid-template-columns var(--duration-cinematic) var(--ease-cinematic)',
              } as CSSProperties
            }
          >
            <div className='min-w-0 overflow-y-auto'>
              {visibleAssets.length === 0 ? (
                <NoResults onReset={resetView} />
              ) : view === 'grid' ? (
                <AssetGrid
                  assets={visibleAssets}
                  selectedId={selectedId}
                  onSelect={openAsset}
                />
              ) : (
                <AssetList
                  assets={visibleAssets}
                  selectedId={selectedId}
                  onSelect={openAsset}
                />
              )}
            </div>
            <AssetDrawer
              asset={selectedAsset}
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
