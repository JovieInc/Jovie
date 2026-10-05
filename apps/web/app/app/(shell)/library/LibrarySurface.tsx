'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ExternalLink,
  FileAudio2,
  FileText,
  Filter,
  Grid3x3,
  ImageIcon,
  Layers,
  LayoutList,
  type LucideIcon,
  Music2,
  Pause,
  PlayCircle,
  Plus,
  RefreshCw,
  Table2,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  type MouseEvent,
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
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
import {
  archiveLibraryRelease,
  restoreRelease,
} from '@/app/app/(shell)/dashboard/releases/actions';
import {
  archiveLibraryMerchCard,
  restoreLibraryMerchCard,
} from '@/app/app/(shell)/library/actions';
import { ArtworkFrame } from '@/components/atoms/ArtworkFrame';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { NavigationDestinationReady } from '@/components/features/dashboard/NavigationDestinationReady';
import { LibraryFilesPanel } from '@/components/features/library/LibraryFilesPanel';
import {
  formatLibraryItemType,
  formatLibraryStatus,
  formatReleaseStatus,
  formatReleaseType,
  LIBRARY_CATALOG_TABLE_COLUMNS,
  LibraryCatalogProvidersCell,
  LibraryCatalogStatusCell,
  LibraryStatusGlyph,
} from '@/components/features/library/library-catalog-columns';
import { WorkInspectorActions } from '@/components/features/library/WorkInspectorActions';
import { LibraryAssetSharePanel } from '@/components/features/library-asset-share/LibraryAssetSharePanel';
import { LibraryAssetShareUrlCell } from '@/components/features/library-asset-share/LibraryAssetShareUrlCell';
import { LibraryShareDropCreator } from '@/components/features/library-share/LibraryShareDropCreator';
import { toast } from '@/components/feedback';
import { EntityHeader } from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { EmptyState } from '@/components/molecules/EmptyState';
import {
  DspQuietRow,
  InspectorEmpty,
  InspectorRow,
  InspectorSection,
  InspectorShell,
  isDspQuietListScope,
  WORK_INSPECTOR_TABS,
  type WorkInspectorTabId,
} from '@/components/molecules/inspector';
import {
  TOOLBAR_MENU_CONTENT_CLASS,
  ToolbarMenuChoiceItem,
} from '@/components/molecules/menus/ToolbarMenuPrimitives';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import {
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_ICON_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
  PageToolbarActionButton,
  PageToolbarTabButton,
  TableEmptyState,
  type ToolbarFilterSuggestion,
  ToolbarFilterSuggestions,
  UnifiedTable,
  ViewModeSlider,
  type ViewModeSliderOption,
} from '@/components/organisms/table';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  convertToCommonDropdownItems,
  TableContextMenu,
} from '@/components/organisms/table/molecules/TableContextMenu';
import {
  alignment,
  type TableRowMode,
} from '@/components/organisms/table/table.styles';
import {
  isFormElement,
  isInteractiveOverlayTarget,
  resolveTableNavAction,
} from '@/components/organisms/table/utils/tableKeyMap';
import { WorkspacePage } from '@/components/organisms/WorkspacePage';
import type { FilterPill } from '@/components/shell/pill-search.types';
import { RowWaveform } from '@/components/shell/RowWaveform';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterHeaderSearch } from '@/contexts/HeaderActionsContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';
import type { ProviderKey } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';
import {
  formatLibraryApprovalStatus,
  LIBRARY_APPROVAL_STATUSES,
  type LibraryApprovalStatus,
  libraryApprovalStatusClasses,
  libraryApprovalStatusDotClasses,
} from '@/lib/library/approval-status';
import type { LibraryAssetShareViewModel } from '@/lib/library/asset-share';
import type { LibraryMerchProductOption } from '@/lib/library/graph-types';
import {
  LIBRARY_LIFECYCLE_STAGES,
  LIBRARY_STAGE_LABELS,
  libraryAssetMatchesStage,
  parseLibraryStageParam,
} from '@/lib/library/lifecycle-stage';
import {
  EMPTY_LIBRARY_POST_RELEASE_BUNDLE,
  type LibraryPostReleaseBundle,
  type LibraryPresenceFindingView,
} from '@/lib/library/post-release-types';
import { updateLibraryProfileVisibility } from '@/lib/library/profile-visibility/client-mutations';
import { releaseStatusDotClasses } from '@/lib/library/release-status';
import type { LibraryRelationshipView } from '@/lib/library/track-drawer-types';
import type { WorkLaunchSummary } from '@/lib/library/work-actions';
import {
  deriveWorkInspectorPresentation,
  scopeWorkInspectorBundle,
} from '@/lib/library/work-inspector-read-model';
import { useSyncReleasesFromSpotifyMutation } from '@/lib/queries/useReleaseMutations';
import {
  type ColumnDef,
  createColumnHelper,
  type RowSelectionState,
} from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import { capitalizeFirst } from '@/lib/utils/string-utils';
import {
  LIBRARY_LIST_ROW_MODE,
  LIBRARY_TABLE_MIN_WIDTH,
  LIBRARY_TABLE_SKELETON_CONFIG,
} from './LibraryLoadingState';
import { LibraryMediaThumbnail } from './LibraryMediaThumbnail';
import {
  attachLibraryProductGraph,
  formatLibraryDuration,
  formatLibraryReleaseDate,
  formatLibraryReleaseDateTitle,
  getLibraryAspectRatioClass,
  getLibraryAssetAspectRatio,
  getLibraryItemKind,
  hasVerifiedLibraryAudioPreview,
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
  buildLibraryEntityActions,
  libraryEntityActionsToContextMenuItems,
} from './library-entity-actions';
import {
  LIBRARY_GRID_DENSITY_OPTIONS,
  parseLibraryViewModeParam,
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
import { PostReleasePanel } from './PostReleasePanel';
import {
  YouTubeMerchRelationshipEditor,
  YouTubeOptimizationPanel,
} from './YouTubeAssetDrawerPanels';

const EMPTY_RELATIONSHIPS: readonly LibraryRelationshipView[] = [];
const LIBRARY_CONTENT_INSET_CLASS =
  'px-(--app-shell-header-padding-x) py-(--app-shell-content-padding-y)';
const LIBRARY_CARD_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface) outline-none';
const LIBRARY_BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface) outline-none';
const LIBRARY_DESKTOP_CONTROL_DENSITY_CLASS =
  'h-8 min-h-8 lg:before:h-8 lg:before:min-w-0';
const LIBRARY_DESKTOP_ICON_CONTROL_DENSITY_CLASS = cn(
  LIBRARY_DESKTOP_CONTROL_DENSITY_CLASS,
  'w-8 min-w-8'
);

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
const noopContextMenuBuilder: LibraryContextMenuBuilder = () => [];
const LibraryPreviewContext = createContext<{
  readonly playingPreviewId: string | null;
  readonly onTogglePreview: LibraryPreviewToggle;
}>({
  playingPreviewId: null,
  onTogglePreview: noopPreviewToggle,
});
const LibraryEntityActionContext = createContext<LibraryContextMenuBuilder>(
  noopContextMenuBuilder
);

type LibraryFilters = {
  readonly statuses: Set<LibraryReleaseAsset['status']>;
  readonly approvalStatuses: Set<LibraryApprovalStatus>;
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

export const PRESETS: readonly {
  readonly id: LibraryPresetId;
  readonly label: string;
  readonly description: string;
  readonly predicate: (asset: LibraryReleaseAsset) => boolean;
}[] = [
  {
    id: 'all',
    label: 'All',
    description: 'Releases, merch, images, videos, and audio',
    predicate: asset => libraryAssetMatchesView(asset, 'all'),
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
  {
    id: 'documents',
    label: 'Documents',
    description: 'Creator documents and scripts',
    predicate: asset => libraryAssetMatchesView(asset, 'documents'),
  },
  {
    id: 'archived',
    label: 'Archived',
    description: 'Archived releases and merch',
    predicate: asset => libraryAssetMatchesView(asset, 'archived'),
  },
];

function emptyFilters(): LibraryFilters {
  return {
    statuses: new Set(),
    approvalStatuses: new Set(),
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

let libraryFilterPillFallbackCounter = 0;

/** Mirrors PillSearch's id scheme so quick-suggestion pills stay indistinguishable from search-created ones. */
function newLibraryFilterPillId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  libraryFilterPillFallbackCounter += 1;
  return `library-pill-${Date.now()}-${libraryFilterPillFallbackCounter}`;
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

function assetMatchesFilters(
  asset: LibraryReleaseAsset,
  filters: LibraryFilters
): boolean {
  if (filters.statuses.size > 0 && !filters.statuses.has(asset.status)) {
    return false;
  }
  if (
    filters.approvalStatuses.size > 0 &&
    !filters.approvalStatuses.has(asset.approvalStatus)
  ) {
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
        // Accept raw enum (`needs_review`) or human label (`Needs Review`).
        return valuesMatchPill(
          [
            asset.approvalStatus,
            formatLibraryApprovalStatus(asset.approvalStatus),
          ],
          pill
        );
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
      filters.approvalStatuses.size +
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

const ReleaseCell = memo(function ReleaseCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  const { playingPreviewId, onTogglePreview } = useContext(
    LibraryPreviewContext
  );
  const hasPreview = hasVerifiedLibraryAudioPreview(asset);
  const isPreviewPlaying = playingPreviewId === asset.id;

  return (
    // system-b-library-fluid-cell: no min-content width, so long titles
    // truncate instead of widening the table past its container.
    <div className='system-b-library-fluid-cell flex items-center gap-2.5'>
      <ArtworkFrame
        size='thumbnail'
        className='system-b-library-artwork-shell group/artwork h-10 w-10'
      >
        <LibraryMediaThumbnail asset={asset} size='row' />
        {hasPreview ? (
          <Button
            variant='ghost'
            size='icon'
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
          </Button>
        ) : null}
      </ArtworkFrame>
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

const ReleaseDateCell = memo(function ReleaseDateCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  return (
    <span
      className='system-b-library-meta-text block whitespace-nowrap text-right tabular-nums text-tertiary-token'
      title={formatLibraryReleaseDateTitle(asset.releaseDate)}
    >
      {asset.releaseDate
        ? formatLibraryReleaseDate(asset.releaseDate)
        : 'No date'}
    </span>
  );
});

const libraryColumnHelper = createColumnHelper<LibraryReleaseAsset>();

function createLibraryTypeColumn(size: number, minSize: number) {
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
    meta: {
      className: 'px-2',
      priority: 2,
      minWidth: size,
      compact: asset => formatLibraryItemType(asset),
    },
  });
}

const LibraryEntityActionCell = memo(function LibraryEntityActionCell({
  asset,
}: {
  readonly asset: LibraryReleaseAsset;
}) {
  const getContextMenuItems = useContext(LibraryEntityActionContext);
  const items = convertContextMenuItems(getContextMenuItems(asset));

  return (
    <div data-testid={`library-row-actions-${asset.id}`}>
      <TableActionMenu
        items={items}
        align='end'
        searchable
        searchPlaceholder='Search actions'
        searchMode='recursive'
      />
    </div>
  );
});

function createLibraryActionColumn(metaClassName: string) {
  return libraryColumnHelper.display({
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => <LibraryEntityActionCell asset={row.original} />,
    size: 40,
    minSize: 40,
    enableSorting: false,
    meta: {
      className: metaClassName,
      headerVisibility: 'sr-only',
      actionVisibility: 'contextual',
    },
  });
}

// Dense Tracks-catalog table (JOV-4846): status · artwork · title · artist ·
// type · BPM · key · energy · rating · length · waveform · DSP providers,
// recreated from the /exp/shell-v1 Tracks table in the shared layer. The
// action menu column is appended here because it needs this surface's
// entity-action context.
const LIBRARY_CATALOG_COLUMNS = [
  ...LIBRARY_CATALOG_TABLE_COLUMNS,
  createLibraryActionColumn('w-10 pl-1 pr-2'),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

export const LIBRARY_TABLE_COLUMNS = [
  libraryColumnHelper.accessor('title', {
    id: 'release',
    header: 'Item',
    cell: ({ row }) => <ReleaseCell asset={row.original} />,
    minSize: 220,
    size: 9999,
    enableSorting: false,
    meta: { className: alignment.workspaceSeamX, primary: true, minWidth: 220 },
  }),
  libraryColumnHelper.display({
    id: 'releaseDate',
    header: 'Release Date',
    cell: ({ row }) => <ReleaseDateCell asset={row.original} />,
    size: 112,
    minSize: 96,
    meta: {
      className: 'pl-2 pr-3',
      priority: 5,
      minWidth: 112,
      compact: asset => <ReleaseDateCell asset={asset} />,
    },
  }),
  // One glyph folds release and approval, so a row never says "Draft" twice.
  libraryColumnHelper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => <LibraryCatalogStatusCell asset={row.original} />,
    size: 40,
    minSize: 40,
    enableSorting: false,
    meta: { className: 'px-2', minWidth: 40, headerVisibility: 'sr-only' },
  }),
  createLibraryTypeColumn(104, 88),
  libraryColumnHelper.display({
    id: 'providers',
    header: 'Providers',
    cell: ({ row }) => <LibraryCatalogProvidersCell asset={row.original} />,
    size: 120,
    minSize: 96,
    meta: {
      className: 'px-2',
      priority: 3,
      minWidth: 120,
      compact: asset =>
        asset.providers.length > 0 ? (
          <LibraryCatalogProvidersCell asset={asset} />
        ) : null,
    },
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
    meta: {
      className: 'px-2',
      priority: 1,
      minWidth: 220,
      // No compact form: a folded URL crowds the title out on narrow rows;
      // sharing lives in the row menu and the inspector.
    },
  }),
  createLibraryActionColumn('w-10 pl-1 pr-2'),
] as ColumnDef<LibraryReleaseAsset, unknown>[];

const STAGE_TABS = ['all', ...LIBRARY_LIFECYCLE_STAGES] as const;

function LibraryStageTabs({
  stage,
  onStage,
}: {
  readonly stage: (typeof STAGE_TABS)[number];
  readonly onStage: (stage: (typeof STAGE_TABS)[number]) => void;
}) {
  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const tabs = Array.from(
      event.currentTarget
        .closest('[role="tablist"]')
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    const currentIndex = tabs.indexOf(event.currentTarget);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : -1;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    nextTab.focus();
    nextTab.click();
  };

  return (
    <div
      role='tablist'
      aria-label='Work Stages'
      data-testid='library-stage-tabs'
      className='flex shrink-0 flex-nowrap items-center gap-1'
    >
      {STAGE_TABS.map(tab => (
        <PageToolbarTabButton
          key={tab}
          id={`library-stage-${tab}-tab`}
          label={LIBRARY_STAGE_LABELS[tab]}
          active={stage === tab}
          role='tab'
          tabIndex={stage === tab ? 0 : -1}
          ariaControls='library-catalog-panel'
          onKeyDown={handleTabKeyDown}
          onClick={() => onStage(tab)}
          className={LIBRARY_DESKTOP_CONTROL_DENSITY_CLASS}
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
        'flex h-7 w-full items-center justify-start gap-2 border px-2 transition-colors duration-fast ease-subtle focus-visible:ring-offset-(--app-shell-content-surface)',
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

interface LibraryFilterPanelProps {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly preset: LibraryPresetId;
  readonly onPreset: (preset: LibraryPresetId) => void;
  readonly savedView: LibrarySavedViewId;
  readonly onSavedView: (savedView: LibrarySavedViewId) => void;
  readonly filters: LibraryFilters;
  readonly onFilters: (filters: LibraryFilters) => void;
  readonly onClearFilters: () => void;
  readonly className?: string;
}

function LibraryFilterPanel({
  assets,
  preset,
  onPreset,
  savedView,
  onSavedView,
  filters,
  onFilters,
  onClearFilters,
  className,
}: LibraryFilterPanelProps) {
  const releaseTypes = uniqueSorted(assets.map(asset => asset.releaseType));
  const statuses = uniqueSorted(assets.map(asset => asset.status));
  const approvalStatuses = uniqueSorted(
    assets.map(asset => asset.approvalStatus)
  );
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
    approvalStatuses: countBy(assets, asset => [asset.approvalStatus]),
    providers: countBy(
      assets,
      asset => asset.providers.map(provider => provider.key) as string[]
    ),
    assetKinds: countBy(assets, asset => asset.assetKinds),
  };
  const activeFilterCount =
    filters.statuses.size +
    filters.approvalStatuses.size +
    filters.releaseTypes.size +
    filters.assetKinds.size +
    filters.providers.size;

  return (
    <fieldset
      data-testid='library-filter-panel'
      className={cn(
        'system-b-library-rail flex min-h-0 min-w-0 flex-col border-0 p-2.5',
        className
      )}
    >
      <legend className='sr-only'>Work Filters</legend>
      <div className='min-h-0 flex-1 overflow-y-auto px-1.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        <div className='pb-2'>
          <div className='flex items-center justify-between gap-2 pb-1 pt-2'>
            <p className='system-b-library-rail-title'>Kind</p>
            {preset !== 'all' ? (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                onClick={() => onPreset('all')}
              >
                Reset
              </Button>
            ) : null}
          </div>
          <div className='space-y-px' data-testid='library-view-filter-chips'>
            {PRESETS.map(view => (
              <LibrarySavedViewRow
                key={view.id}
                label={view.label}
                count={assets.filter(view.predicate).length}
                active={preset === view.id}
                onClick={() => onPreset(view.id)}
              />
            ))}
          </div>
        </div>

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
          {hasActiveFilters(filters) || preset !== 'all' ? (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              onClick={onClearFilters}
              className='h-auto rounded-xs px-1.5 py-0.5 text-tertiary-token hover:bg-surface-1 hover:text-primary-token'
            >
              Clear Filters ({activeFilterCount + (preset === 'all' ? 0 : 1)})
            </Button>
          ) : null}
        </div>

        <FilterSection label='Approval Status'>
          {approvalStatuses.map(status => (
            <FilterRow
              key={status}
              active={filters.approvalStatuses.has(status)}
              count={counts.approvalStatuses.get(status) ?? 0}
              label={formatLibraryApprovalStatus(status)}
              dotClassName={libraryApprovalStatusDotClasses(status)}
              onClick={() =>
                onFilters({
                  ...filters,
                  approvalStatuses: toggleSet(filters.approvalStatuses, status),
                })
              }
            />
          ))}
        </FilterSection>

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
              icon={Layers}
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
    </fieldset>
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
        'system-b-library-filter-row flex h-7 w-full items-center gap-2 border px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--app-shell-content-surface) outline-none',
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

function LibraryFiltersControl({
  activeFilterCount,
  filterPanel,
  isDesktop,
  open,
  onOpenChange,
}: {
  readonly activeFilterCount: number;
  readonly filterPanel: ReactNode;
  readonly isDesktop: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const ariaLabel =
    activeFilterCount > 0
      ? `Show filters (${activeFilterCount})`
      : 'Show filters';
  const trigger = (
    <PageToolbarActionButton
      label='Show Filters'
      icon={
        <span className='relative grid place-items-center'>
          <Filter className={PAGE_TOOLBAR_ICON_CLASS} />
          {activeFilterCount > 0 ? (
            <span
              data-testid='library-filter-active-indicator'
              className='absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent'
              aria-hidden='true'
            />
          ) : null}
        </span>
      }
      ariaLabel={ariaLabel}
      active={open}
      iconOnly
      className={LIBRARY_DESKTOP_ICON_CONTROL_DENSITY_CLASS}
    />
  );

  if (isDesktop) {
    return (
      <Tooltip>
        <Popover open={open} onOpenChange={onOpenChange}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </TooltipTrigger>
          <PopoverContent
            aria-label='Work Filters'
            align='end'
            sideOffset={6}
            className='flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-80 overflow-hidden p-0'
            testId='library-filter-popover'
          >
            {filterPanel}
          </PopoverContent>
        </Popover>
        <TooltipContent side='bottom'>Show filters</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
        </TooltipTrigger>
        <SheetContent
          side='right'
          className='flex w-full max-w-[22rem] flex-col gap-0 p-0'
          testId='library-filter-sheet'
        >
          <SheetHeader className='shrink-0 border-b border-subtle px-4 py-3 text-left'>
            <SheetTitle>Work Filters</SheetTitle>
            <SheetDescription className='sr-only'>
              Filter by saved view, approval, release status, type, asset, or
              provider.
            </SheetDescription>
          </SheetHeader>
          {filterPanel}
        </SheetContent>
      </Sheet>
      <TooltipContent side='bottom'>Show filters</TooltipContent>
    </Tooltip>
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
    <Tooltip>
      <DropdownMenu>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <PageToolbarActionButton
              label={`Sort by ${SORT_LABELS[sort]}`}
              icon={
                <ArrowUpDown
                  className={PAGE_TOOLBAR_ICON_CLASS}
                  strokeWidth={2.25}
                />
              }
              ariaLabel={`Sort by ${SORT_LABELS[sort]}`}
              iconOnly
              className={LIBRARY_DESKTOP_ICON_CONTROL_DENSITY_CLASS}
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <DropdownMenuContent
          align='end'
          side='bottom'
          sideOffset={6}
          aria-label='Sort Work'
          className={TOOLBAR_MENU_CONTENT_CLASS}
        >
          {(Object.keys(SORT_LABELS) as LibrarySortKey[]).map(key => (
            <ToolbarMenuChoiceItem
              key={key}
              active={sort === key}
              label={SORT_LABELS[key]}
              onSelect={() => onSort(key)}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent side='bottom'>
        Sort by {SORT_LABELS[sort].toLowerCase()}
      </TooltipContent>
    </Tooltip>
  );
}

const LIBRARY_VIEW_MODE_OPTIONS: readonly ViewModeSliderOption<LibraryViewMode>[] =
  [
    { value: 'grid', label: 'Grid View', icon: Grid3x3 },
    { value: 'list', label: 'List View', icon: LayoutList },
    { value: 'table', label: 'Table View', icon: Table2 },
  ];

function ViewToggle({
  view,
  onView,
}: {
  readonly view: LibraryViewMode;
  readonly onView: (view: LibraryViewMode) => void;
}) {
  return (
    <ViewModeSlider
      aria-label='Work View'
      data-testid='library-view-mode-slider'
      value={view}
      onChange={onView}
      options={LIBRARY_VIEW_MODE_OPTIONS}
    />
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
      // Every density is two columns below sm, so the control would be inert.
      className={cn(
        PAGE_TOOLBAR_END_GROUP_CLASS,
        'ml-0 hidden gap-0.5 border-0 p-0 sm:flex'
      )}
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
          className={LIBRARY_DESKTOP_ICON_CONTROL_DENSITY_CLASS}
        />
      ))}
    </fieldset>
  );
}

function LibraryImportMenu({
  canSyncSpotify,
  isSyncingSpotify,
  onSyncSpotify,
  youtubeConnected,
  isImportingYouTube,
  youtubeImportDisabled = false,
  onImportYouTube,
}: {
  readonly canSyncSpotify: boolean;
  readonly isSyncingSpotify: boolean;
  readonly onSyncSpotify: () => void;
  readonly youtubeConnected: boolean;
  readonly isImportingYouTube: boolean;
  readonly youtubeImportDisabled?: boolean;
  readonly onImportYouTube?: () => void;
}) {
  if (!onImportYouTube && !canSyncSpotify) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          size='sm'
          disabled={isImportingYouTube || isSyncingSpotify}
        >
          <Plus className={PAGE_TOOLBAR_ICON_CLASS} aria-hidden='true' />
          {isImportingYouTube ? 'Importing…' : 'Add'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        side='bottom'
        sideOffset={6}
        aria-label='Add Or Import'
        className={TOOLBAR_MENU_CONTENT_CLASS}
      >
        {onImportYouTube ? (
          <DropdownMenuItem
            disabled={youtubeImportDisabled}
            onSelect={() => onImportYouTube()}
          >
            {youtubeConnected ? 'Import YouTube' : 'Connect YouTube'}
          </DropdownMenuItem>
        ) : null}
        {canSyncSpotify ? (
          <DropdownMenuItem
            onSelect={() => onSyncSpotify()}
            disabled={isSyncingSpotify}
          >
            {isSyncingSpotify ? 'Syncing…' : 'Sync from Spotify'}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LibraryToolbar({
  stage,
  onStage,
  sort,
  onSort,
  view,
  onView,
  gridDensity,
  onGridDensity,
  visibleCount,
  totalCount,
  filtersOpen,
  onFiltersOpenChange,
  activeFilterCount,
  filterPanel,
  isDesktop,
  suggestedFilters,
  canSyncSpotify,
  isSyncingSpotify,
  onSyncSpotify,
  youtubeConnected = false,
  isImportingYouTube = false,
  youtubeImportDisabled = false,
  onImportYouTube,
}: {
  readonly stage: (typeof STAGE_TABS)[number];
  readonly onStage: (stage: (typeof STAGE_TABS)[number]) => void;
  readonly sort: LibrarySortKey;
  readonly onSort: (sort: LibrarySortKey) => void;
  readonly view: LibraryViewMode;
  readonly onView: (view: LibraryViewMode) => void;
  readonly gridDensity: LibraryGridDensity;
  readonly onGridDensity: (density: LibraryGridDensity) => void;
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly filtersOpen: boolean;
  readonly onFiltersOpenChange: (open: boolean) => void;
  readonly activeFilterCount: number;
  readonly filterPanel: ReactNode;
  readonly isDesktop: boolean;
  readonly suggestedFilters: readonly ToolbarFilterSuggestion[];
  readonly canSyncSpotify: boolean;
  readonly isSyncingSpotify: boolean;
  readonly onSyncSpotify: () => void;
  readonly youtubeConnected?: boolean;
  readonly isImportingYouTube?: boolean;
  readonly youtubeImportDisabled?: boolean;
  readonly onImportYouTube?: () => void;
}) {
  return (
    <PageToolbar
      // Below sm the stage row takes the full width and actions wrap beneath
      // it, so tabs scroll instead of clipping beside the action group.
      className='flex-wrap sm:flex-nowrap'
      startClassName='basis-full sm:basis-auto'
      start={
        <div className='flex min-w-0 items-center gap-2'>
          <LibraryStageTabs stage={stage} onStage={onStage} />
          <div className='group/toolbar-filters flex min-w-0 shrink-0 items-center gap-1'>
            <LibraryFiltersControl
              activeFilterCount={activeFilterCount}
              filterPanel={filterPanel}
              isDesktop={isDesktop}
              open={filtersOpen}
              onOpenChange={onFiltersOpenChange}
            />
            <ToolbarFilterSuggestions
              data-testid='library-filter-suggestions'
              suggestions={suggestedFilters}
              hidden={filtersOpen}
            />
          </div>
          <span
            className={cn(PAGE_TOOLBAR_META_TEXT_CLASS, 'whitespace-nowrap')}
          >
            {visibleCount}
            {visibleCount === totalCount ? '' : ` of ${totalCount}`} visible
          </span>
        </div>
      }
      end={
        <>
          <YouTubeLedgerLink />
          <LibraryImportMenu
            canSyncSpotify={canSyncSpotify}
            isSyncingSpotify={isSyncingSpotify}
            onSyncSpotify={onSyncSpotify}
            youtubeConnected={youtubeConnected}
            isImportingYouTube={isImportingYouTube}
            youtubeImportDisabled={youtubeImportDisabled}
            onImportYouTube={onImportYouTube}
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

/** The one meta line under a tile title: what it is, then when or how much. */
export function formatLibraryTileMeta(asset: LibraryReleaseAsset): string {
  const type = formatLibraryItemType(asset);
  if (getLibraryItemKind(asset) === 'merch') {
    return asset.salePriceLabel ? `${type} · ${asset.salePriceLabel}` : type;
  }
  const year = asset.releaseDate
    ? new Date(asset.releaseDate).getUTCFullYear()
    : Number.NaN;
  return Number.isFinite(year) ? `${type} · ${year}` : type;
}

interface LibraryTilePlayback {
  readonly currentTime: number;
  readonly duration: number;
  readonly onSeek: (seconds: number) => void;
}

/**
 * Frame.io-style tile: artwork, title with one status glyph, one meta line.
 * Playback lives on the artwork only: play on hover or focus, and a scrub
 * strip once this tile owns the player.
 */
const AssetCard = memo(function AssetCard({
  asset,
  selected,
  isPreviewActive,
  isPreviewPlaying,
  playback,
  onSelect,
  onTogglePreview,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly selected: boolean;
  readonly isPreviewActive: boolean;
  readonly isPreviewPlaying: boolean;
  /** Present only on the tile that owns the player, so other tiles stay memoized. */
  readonly playback?: LibraryTilePlayback;
  readonly onSelect: () => void;
  readonly onTogglePreview: LibraryPreviewToggle;
}) {
  const hasPreview = hasVerifiedLibraryAudioPreview(asset);
  const aspectRatio = getLibraryAssetAspectRatio(asset);
  const scrubDuration =
    playback && playback.duration > 0 ? playback.duration : null;

  return (
    <article
      data-library-item-id={asset.id}
      className={cn(
        // Artwork overlays (play, scrub) share the button's first grid row
        // through subgrid, so they sit on the art without nesting controls
        // inside the button or measuring its height.
        'system-b-library-card group relative grid min-w-0 grid-cols-1 grid-rows-[auto_1fr] overflow-hidden border',
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
          'col-start-1 row-span-2 row-start-1 grid h-full w-full grid-rows-subgrid items-stretch justify-stretch gap-0 rounded-none p-0 text-left transition-colors duration-fast ease-subtle hover:bg-transparent active:bg-transparent',
          LIBRARY_CARD_FOCUS_CLASS
        )}
      >
        <button
          type='button'
          onClick={onSelect}
          aria-label={`View ${asset.title}`}
          data-library-item-focus
        >
          <div
            className={cn(
              'system-b-library-card-artwork relative overflow-hidden',
              getLibraryAspectRatioClass(aspectRatio)
            )}
          >
            <LibraryMediaThumbnail asset={asset} size='card' />
          </div>
          <div className='min-w-0 px-2.5 pb-2.5 pt-2'>
            <div className='flex min-w-0 items-center gap-1.5'>
              <h2 className='system-b-library-card-title min-w-0 flex-1 truncate'>
                {asset.title}
              </h2>
              <LibraryStatusGlyph asset={asset} className='shrink-0' />
            </div>
            <p
              className='system-b-library-card-meta mt-0.5 truncate tabular-nums'
              data-testid={`library-card-meta-${asset.id}`}
            >
              {formatLibraryTileMeta(asset)}
            </p>
          </div>
        </button>
      </Button>
      {hasPreview ? (
        <Button
          variant='ghost'
          size='icon'
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
            'system-b-library-preview-float z-10 col-start-1 row-start-1 m-2 grid h-8 w-8 place-items-center self-start justify-self-start backdrop-blur transition-opacity duration-fast ease-subtle',
            isPreviewActive
              ? 'opacity-100'
              : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
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
        </Button>
      ) : null}
      {playback && scrubDuration ? (
        <div
          className='system-b-library-card-scrub z-10 col-start-1 row-start-1 self-end px-2 pb-1 pt-4'
          data-testid={`library-card-scrub-${asset.id}`}
        >
          <RowWaveform
            track={{
              id: asset.id,
              title: asset.title,
              durationSec: scrubDuration,
              waveformSeed: asset.waveformSeed,
              cues: [],
            }}
            currentTimeSec={playback.currentTime}
            isCurrentTrack
            onSeek={playback.onSeek}
            className='h-6'
          />
        </div>
      ) : null}
    </article>
  );
});

export type LibraryReviewStep =
  | { readonly kind: 'move'; readonly delta: number }
  | { readonly kind: 'edge'; readonly to: 'first' | 'last' }
  | { readonly kind: 'play' }
  | { readonly kind: 'open' };

/**
 * Keyboard review across grid, list and table: J/K and arrows move, Space
 * plays, Enter inspects. In the grid, up and down jump a row of tiles.
 * Focused controls keep their native keys, except the tile itself, where
 * Space plays instead of opening.
 */
export function resolveLibraryReviewStep(
  key: string,
  target: EventTarget | null,
  gridColumns: number | null
): LibraryReviewStep | null {
  if (target instanceof Element && target.closest('[role="slider"]')) {
    return null;
  }
  const nativeControl =
    target instanceof Element &&
    Boolean(target.closest('button, a[href]')) &&
    !target.closest('[data-library-item-focus]');
  const isGrid = gridColumns !== null;
  if (isGrid && (key === 'ArrowRight' || key === 'ArrowLeft')) {
    return isFormElement(target)
      ? null
      : { kind: 'move', delta: key === 'ArrowRight' ? 1 : -1 };
  }
  const rowStep = isGrid ? Math.max(1, gridColumns) : 1;
  switch (resolveTableNavAction(key, target)) {
    case 'next':
      return { kind: 'move', delta: key === 'ArrowDown' ? rowStep : 1 };
    case 'prev':
      return { kind: 'move', delta: key === 'ArrowUp' ? -rowStep : -1 };
    case 'first':
      return { kind: 'edge', to: 'first' };
    case 'last':
      return { kind: 'edge', to: 'last' };
    case 'toggle':
      return nativeControl ? null : { kind: 'play' };
    case 'activate':
      // Buttons and tiles activate natively; only the page itself needs help.
      return target instanceof Element && target.closest('button, a[href]')
        ? null
        : { kind: 'open' };
    default:
      return null;
  }
}

/** The tile button or table row that carries keyboard focus for an item. */
function findLibraryItemFocusTarget(
  region: HTMLElement,
  id: string
): HTMLElement | null {
  const tile = Array.from(
    region.querySelectorAll<HTMLElement>('[data-library-item-id]')
  ).find(element => element.dataset.libraryItemId === id);
  if (tile) return tile.querySelector<HTMLElement>('[data-library-item-focus]');
  return (
    Array.from(region.querySelectorAll<HTMLElement>('tr[data-testid]')).find(
      row => row.dataset.testid?.endsWith(`-row-${id}`)
    ) ?? null
  );
}

function AssetGrid({
  assets,
  selectedId,
  activePreviewId,
  playingPreviewId,
  activePlayback,
  gridDensity,
  onSelect,
  onTogglePreview,
  getContextMenuItems,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly activePlayback?: LibraryTilePlayback;
  readonly gridDensity: LibraryGridDensity;
  readonly onSelect: (id: string) => void;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
}) {
  return (
    <div
      data-library-grid
      className={cn(
        LIBRARY_GRID_DENSITY_LAYOUT[gridDensity],
        LIBRARY_CONTENT_INSET_CLASS
      )}
    >
      {assets.map(asset => (
        <TableContextMenu
          key={asset.id}
          items={getContextMenuItems(asset)}
          searchable
          searchPlaceholder='Search actions'
          searchMode='recursive'
        >
          <AssetCard
            asset={asset}
            selected={selectedId === asset.id}
            isPreviewActive={activePreviewId === asset.id}
            isPreviewPlaying={playingPreviewId === asset.id}
            playback={activePreviewId === asset.id ? activePlayback : undefined}
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
  rowMode,
  playingPreviewId,
  onSelect,
  onCursor,
  onRowToggle,
  onTogglePreview,
  getContextMenuItems,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly selectedId: string | null;
  readonly columns: ColumnDef<LibraryReleaseAsset, unknown>[];
  readonly hideHeader?: boolean;
  readonly rowTestIdPrefix: 'library-release-row' | 'library-catalog-row';
  readonly rowMode: TableRowMode;
  readonly playingPreviewId?: string | null;
  readonly onSelect: (id: string) => void;
  /** Keyboard focus moved to a row; selection (and an open inspector) follows. */
  readonly onCursor: (id: string) => void;
  /** Space on a row. */
  readonly onRowToggle: (asset: LibraryReleaseAsset) => void;
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
      onRowToggle={onRowToggle}
      onFocusedRowChange={index => {
        const asset = tableData[index];
        if (asset) onCursor(asset.id);
      }}
      getRowId={getRowId}
      getRowTestId={getRowTestId}
      rowSelection={rowSelection}
      getRowClassName={getRowClassName}
      getContextMenuItems={getContextMenuItems}
      contextMenuSearchable
      contextMenuSearchPlaceholder='Search actions'
      contextMenuSearchMode='recursive'
      enableVirtualization={assets.length >= 20}
      rowMode={rowMode}
      minWidth={LIBRARY_TABLE_MIN_WIDTH}
      hideHeader={hideHeader}
      className='system-b-library-table'
      containerClassName='h-full'
      skeletonRows={SKELETON_ROW_COUNT.TABLE}
      skeletonColumnConfig={LIBRARY_TABLE_SKELETON_CONFIG}
    />
  );
  const tableWithActions = (
    <LibraryEntityActionContext.Provider value={getContextMenuItems}>
      {table}
    </LibraryEntityActionContext.Provider>
  );

  if (!onTogglePreview) {
    return tableWithActions;
  }

  return (
    <LibraryPreviewContext.Provider value={previewContext}>
      {tableWithActions}
    </LibraryPreviewContext.Provider>
  );
}

function LibraryFirstAction({
  canSyncSpotify,
  isSyncing,
  onSyncSpotify,
  testId,
}: {
  readonly canSyncSpotify: boolean;
  readonly isSyncing: boolean;
  readonly onSyncSpotify: () => void;
  readonly testId?: string;
}) {
  if (!canSyncSpotify) {
    return (
      <Button asChild size='sm'>
        <Link href={APP_ROUTES.RELEASES}>Open Releases</Link>
      </Button>
    );
  }

  return (
    <Button
      type='button'
      size='sm'
      disabled={isSyncing}
      onClick={onSyncSpotify}
      data-testid={testId}
    >
      <RefreshCw
        className={cn(
          'h-4 w-4',
          isSyncing && 'animate-spin motion-reduce:animate-none'
        )}
        aria-hidden='true'
      />
      {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
    </Button>
  );
}

function YouTubeLedgerLink() {
  return (
    <Button
      asChild
      variant='ghost'
      size='sm'
      className={PAGE_TOOLBAR_ACTION_BUTTON_CLASS}
    >
      <Link href={APP_ROUTES.YOUTUBE_REVIVAL}>YouTube Ledger</Link>
    </Button>
  );
}

function EmptyCatalog({
  canSyncSpotify,
  isSyncing,
  onSyncSpotify,
}: {
  readonly canSyncSpotify: boolean;
  readonly isSyncing: boolean;
  readonly onSyncSpotify: () => void;
}) {
  return (
    <WorkspacePage
      aria-label='Work'
      frame='content-container'
      contentPadding='none'
      surfaceMode='table'
      data-testid='library-surface'
      toolbar={
        <PageToolbar
          start={<span className={PAGE_TOOLBAR_META_TEXT_CLASS}>0 items</span>}
          end={
            <>
              <YouTubeLedgerLink />
              <LibraryFirstAction
                canSyncSpotify={canSyncSpotify}
                isSyncing={isSyncing}
                onSyncSpotify={onSyncSpotify}
                testId='library-sync-spotify-toolbar'
              />
            </>
          }
        />
      }
    >
      <NavigationDestinationReady destination='library' />
      <EmptyState
        icon={<Music2 className='h-5 w-5' strokeWidth={2.25} />}
        heading='No work yet'
        description='Releases, merch, images, videos, and audio will appear here as they land.'
        presentation='workspace'
        testId='library-workspace-empty-state'
        className='min-h-90'
        actionSlot={
          <LibraryFirstAction
            canSyncSpotify={canSyncSpotify}
            isSyncing={isSyncing}
            onSyncSpotify={onSyncSpotify}
            testId='library-sync-spotify-empty-state'
          />
        }
      />
    </WorkspacePage>
  );
}

function NoResults({ onReset }: { readonly onReset: () => void }) {
  return (
    <TableEmptyState
      heading='No work matches'
      description='No releases, products, or files match the selected view or filters.'
      className='min-h-75'
      action={{
        label: 'Reset View',
        onClick: onReset,
        variant: 'ghost',
      }}
    />
  );
}

function MetadataRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return <InspectorRow label={label} value={value} />;
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
  if (!hasVerifiedLibraryAudioPreview(asset)) {
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
    <Button
      variant='ghost'
      size='sm'
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
    </Button>
  );
}

function ApprovalStatusEditor({
  asset,
  profileId,
  disabled,
  saving,
  onStatusChange,
}: {
  readonly asset: LibraryReleaseAsset;
  readonly profileId: string | null;
  readonly disabled: boolean;
  readonly saving: boolean;
  readonly onStatusChange: (
    asset: LibraryReleaseAsset,
    approvalStatus: LibraryApprovalStatus
  ) => Promise<void>;
}) {
  async function handleSelect(nextStatus: LibraryApprovalStatus) {
    if (!profileId || nextStatus === asset.approvalStatus) {
      return;
    }

    await onStatusChange(asset, nextStatus);
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
            'system-b-library-status-pill inline-flex h-6 max-w-full items-center gap-1 truncate rounded-full border px-2',
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

function AssetDrawer({
  asset,
  open,
  onClose,
  activePreviewId,
  playingPreviewId,
  onTogglePreview,
  onAudioUploaded,
  onArtworkUploaded,
  getContextMenuItems,
  profileId,
  approvalSavingIds,
  artistHandle,
  shareCandidates,
  workLaunches,
  merchProducts,
  relationships,
  postReleaseBundle,
  onApprovalStatusChange,
  onShareChange,
}: {
  readonly asset: LibraryReleaseAsset | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly activePreviewId: string | null;
  readonly playingPreviewId: string | null;
  readonly onTogglePreview: LibraryPreviewToggle;
  readonly onAudioUploaded: (assetId: string, previewUrl: string) => void;
  readonly onArtworkUploaded: (assetId: string, artworkUrl: string) => void;
  readonly getContextMenuItems: LibraryContextMenuBuilder;
  readonly profileId: string | null;
  readonly approvalSavingIds: ReadonlySet<string>;
  readonly artistHandle: string | null;
  readonly shareCandidates: readonly LibraryReleaseAsset[];
  readonly workLaunches: readonly WorkLaunchSummary[];
  readonly merchProducts: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  readonly relationships: readonly LibraryRelationshipView[];
  readonly postReleaseBundle: LibraryPostReleaseBundle;
  readonly onApprovalStatusChange: (
    asset: LibraryReleaseAsset,
    approvalStatus: LibraryApprovalStatus
  ) => Promise<void>;
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

  // Keep the last object only while the drawer closes for its exit animation.
  // An open drawer with no resolved selection must never show the prior work.
  const current = asset ?? (open ? null : stickyAsset);
  const workKind = current ? getLibraryItemKind(current) : null;
  const isMerch = workKind === 'merch';
  const isYouTubeVideo = current?.source?.provider === 'youtube';
  const [tabSelection, setTabSelection] = useState<{
    readonly objectId: string | null;
    readonly tab: WorkInspectorTabId;
  }>({ objectId: null, tab: 'overview' });
  const closedTabIndex = open ? undefined : -1;
  const currentId = current?.id ?? null;
  const activeTab =
    tabSelection.objectId === currentId ? tabSelection.tab : 'overview';
  const handleTabChange = useCallback(
    (tab: WorkInspectorTabId) => {
      if (!currentId) return;
      setTabSelection({ objectId: currentId, tab });
    },
    [currentId]
  );
  const [findingState, setFindingState] = useState({
    source: postReleaseBundle.findings,
    findings: postReleaseBundle.findings,
  });
  const findings =
    findingState.source === postReleaseBundle.findings
      ? findingState.findings
      : postReleaseBundle.findings;
  const handleFindingChange = useCallback(
    (next: LibraryPresenceFindingView) => {
      setFindingState(previous => ({
        source: postReleaseBundle.findings,
        findings: (previous.source === postReleaseBundle.findings
          ? previous.findings
          : postReleaseBundle.findings
        ).map(finding => (finding.id === next.id ? next : finding)),
      }));
    },
    [postReleaseBundle.findings]
  );
  const inspectorBundle = useMemo(
    () =>
      current
        ? scopeWorkInspectorBundle(current, { ...postReleaseBundle, findings })
        : EMPTY_LIBRARY_POST_RELEASE_BUNDLE,
    [current, postReleaseBundle, findings]
  );
  const presentation = useMemo(
    () => (current ? deriveWorkInspectorPresentation(current) : null),
    [current]
  );
  const contextualBlockers = inspectorBundle.findings.filter(
    finding =>
      finding.primitive === 'blocker' &&
      finding.blocksSelectedObject &&
      finding.status !== 'resolved' &&
      finding.status !== 'dismissed'
  );
  const hasPostReleaseActivity =
    inspectorBundle.downloads.length > 0 ||
    inspectorBundle.findings.length > 0 ||
    inspectorBundle.rightsholders.length > 0;
  const isPreviewPlaying =
    currentId !== null &&
    currentId === playingPreviewId &&
    currentId === activePreviewId;
  const handleDrawerKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    },
    [onClose]
  );
  const drawerHeaderActions = current ? (
    <DrawerHeaderActions
      primaryActions={[
        {
          id: 'open-full-view',
          label: 'Open Full View',
          icon: ExternalLink,
          href: current.primaryActionHref ?? current.smartLinkPath,
        },
      ]}
      menuItems={convertToCommonDropdownItems(getContextMenuItems(current))}
      onClose={onClose}
      searchable
      searchPlaceholder='Search actions'
      searchMode='recursive'
    />
  ) : null;

  return (
    <InspectorShell
      isOpen={open}
      width={360}
      ariaLabel='Work details'
      onKeyDown={handleDrawerKeyDown}
      contextMenuItems={convertToCommonDropdownItems(
        current ? getContextMenuItems(current) : []
      )}
      testId='library-asset-drawer'
      isEmpty={!current}
      emptyMessage='Select a release, product, or file to view details.'
      tabs={WORK_INSPECTOR_TABS}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      tabsAriaLabel='Inspector tabs'
      objectHeader={
        current ? (
          <EntityHeader
            thumbnail={
              <div className='h-12 w-12 shrink-0 overflow-hidden'>
                <LibraryMediaThumbnail asset={current} size='drawer' />
              </div>
            }
            title={current.title}
            subtitle={current.artist}
            meta={
              <div className='flex h-6 min-w-0 items-center'>
                <LibraryStatusGlyph asset={current} showLabel />
              </div>
            }
            stableLayout
            titleLineClamp={1}
            subtitleLineClamp={1}
            reserveSubtitleSlot
            reserveMetaSlot
            metaOverflow='scroll'
            actions={drawerHeaderActions}
            bodyClassName='pr-8'
            data-testid='library-asset-entity-header'
          />
        ) : undefined
      }
    >
      {current ? (
        <TableContextMenu
          items={getContextMenuItems(current)}
          searchable
          searchPlaceholder='Search actions'
          searchMode='recursive'
        >
          <div
            key={current.id}
            data-inspector-object-id={current.id}
            className={cn(
              activeTab === 'overview'
                ? 'divide-y divide-subtle'
                : 'space-y-2.5'
            )}
          >
            {activeTab === 'overview' ? (
              <>
                {!isMerch && hasVerifiedLibraryAudioPreview(current) ? (
                  <InspectorSection title='Preview' className='pb-3 first:pt-0'>
                    <div className='flex items-center justify-between gap-2'>
                      <span className='system-b-library-drawer-panel-copy min-w-0 flex-1 truncate text-secondary-token'>
                        {current.title}
                      </span>
                      <PreviewActionButton
                        asset={current}
                        isPreviewPlaying={isPreviewPlaying}
                        onTogglePreview={onTogglePreview}
                        compact
                        disabledTabIndex={closedTabIndex}
                      />
                    </div>
                  </InspectorSection>
                ) : null}

                {!isMerch ? (
                  <InspectorSection title='Actions'>
                    <WorkInspectorActions
                      asset={current}
                      launches={workLaunches}
                      canPublish={profileId !== null}
                      disabled={!open}
                      onSharePrivately={() => handleTabChange('files')}
                    />
                  </InspectorSection>
                ) : null}

                {presentation ? (
                  <InspectorSection
                    title='Public presentation'
                    className='py-3 first:pt-0'
                    data-testid='work-inspector-presentation'
                  >
                    <dl>
                      <MetadataRow
                        label='Lifecycle'
                        value={formatLibraryStatus(current)}
                      />
                      <MetadataRow
                        label='Public Page'
                        value={
                          presentation.pagePublication === 'live'
                            ? 'Live'
                            : presentation.pagePublication === 'not_public'
                              ? 'Not public'
                              : 'Unknown'
                        }
                      />
                      <MetadataRow
                        label='Profile'
                        value={
                          presentation.profileVisibility === 'visible'
                            ? 'Shown on profile'
                            : 'Hidden from profile'
                        }
                      />
                      <MetadataRow
                        label='Visitor Action'
                        value={presentation.primaryVisitorAction}
                      />
                      <MetadataRow
                        label='Destinations'
                        value={
                          presentation.destinationState === 'connected'
                            ? presentation.destinations.join(', ')
                            : presentation.destinationState === 'disconnected'
                              ? 'Disconnected'
                              : 'Not supported'
                        }
                      />
                    </dl>
                    {contextualBlockers.length > 0 ? (
                      <div className='space-y-1 border-l-2 border-warning pl-2'>
                        {contextualBlockers.map(blocker => (
                          <p
                            key={blocker.id}
                            className='system-b-library-drawer-panel-copy leading-5 text-secondary-token'
                          >
                            {blocker.title}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {!isMerch ? (
                      <LibraryAssetSharePanel
                        key={current.id}
                        asset={current}
                        profileId={profileId}
                        artistHandle={artistHandle}
                        disabled={!open}
                        initialShare={current.share}
                        onShareChange={onShareChange}
                      />
                    ) : null}
                  </InspectorSection>
                ) : null}

                <InspectorSection
                  title='About'
                  className='py-3'
                  data-testid='work-inspector-about'
                >
                  {current.description ? (
                    <p className='system-b-library-drawer-panel-copy leading-5 text-secondary-token'>
                      {current.description}
                    </p>
                  ) : null}
                  <dl>
                    <MetadataRow
                      label='Review Status'
                      value={
                        <ApprovalStatusEditor
                          asset={current}
                          profileId={profileId}
                          disabled={!open}
                          saving={approvalSavingIds.has(current.id)}
                          onStatusChange={onApprovalStatusChange}
                        />
                      }
                    />
                    <MetadataRow
                      label='Type'
                      value={formatLibraryItemType(current)}
                    />
                    {current.releaseDate ? (
                      <MetadataRow
                        label={
                          workKind === 'video'
                            ? 'Published'
                            : isMerch || workKind === 'document'
                              ? 'Updated'
                              : 'Release Date'
                        }
                        value={
                          <span
                            title={formatLibraryReleaseDateTitle(
                              current.releaseDate
                            )}
                          >
                            {formatLibraryReleaseDate(current.releaseDate)}
                          </span>
                        }
                      />
                    ) : null}
                    {isMerch ? (
                      <>
                        {current.productType ? (
                          <MetadataRow
                            label='Product'
                            value={capitalizeFirst(current.productType)}
                          />
                        ) : null}
                        {current.sellabilityLabel ? (
                          <MetadataRow
                            label='Availability'
                            value={current.sellabilityLabel}
                          />
                        ) : null}
                        {current.salePriceLabel ? (
                          <MetadataRow
                            label='Price'
                            value={current.salePriceLabel}
                          />
                        ) : null}
                        {current.profitLabel ? (
                          <MetadataRow
                            label='Estimated Profit'
                            value={current.profitLabel}
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        {(workKind === 'release' || workKind === 'audio') &&
                        current.trackCount > 0 ? (
                          <MetadataRow
                            label='Tracks'
                            value={current.trackCount}
                          />
                        ) : null}
                        {current.totalDurationMs != null ? (
                          <MetadataRow
                            label='Duration'
                            value={formatLibraryDuration(
                              current.totalDurationMs
                            )}
                          />
                        ) : null}
                        {current.genres.length > 0 ? (
                          <MetadataRow
                            label='Genres'
                            value={current.genres.join(', ')}
                          />
                        ) : null}
                        {current.label || current.distributor ? (
                          <MetadataRow
                            label='Label'
                            value={current.label ?? current.distributor}
                          />
                        ) : null}
                        {current.upc ? (
                          <MetadataRow label='UPC' value={current.upc} />
                        ) : null}
                        {current.primaryIsrc ? (
                          <MetadataRow
                            label='ISRC'
                            value={current.primaryIsrc}
                          />
                        ) : null}
                        {workKind === 'video' && current.privacyStatus ? (
                          <MetadataRow
                            label='Video Access'
                            value={capitalizeFirst(current.privacyStatus)}
                          />
                        ) : null}
                        {workKind === 'document' && current.documentStage ? (
                          <MetadataRow
                            label='Stage'
                            value={capitalizeFirst(
                              current.documentStage.replaceAll('_', ' ')
                            )}
                          />
                        ) : null}
                      </>
                    )}
                    {!isMerch && current.source ? (
                      <MetadataRow
                        label='Source'
                        value={`${capitalizeFirst(current.source.provider)} · ${current.source.canonicalId}`}
                      />
                    ) : null}
                  </dl>
                </InspectorSection>

                {!isMerch &&
                isDspQuietListScope(workKind ?? 'release') &&
                current.providers.length > 0 ? (
                  <InspectorSection title='Destinations' className='py-3'>
                    <div className='space-y-0.5'>
                      {current.providers.map(provider => (
                        <DspQuietRow
                          key={`${current.id}-${provider.key}`}
                          className='system-b-library-provider-link'
                          label={provider.label}
                          href={provider.url}
                          closedTabIndex={closedTabIndex}
                          icon={
                            <ProviderIcon
                              provider={provider.key as ProviderKey}
                              className='h-3.5 w-3.5'
                            />
                          }
                        />
                      ))}
                    </div>
                  </InspectorSection>
                ) : null}

                {isYouTubeVideo &&
                current.source &&
                (merchProducts.length > 0 ||
                  relationships.some(
                    relationship =>
                      relationship.subjectId === current.source?.canonicalId
                  )) ? (
                  <InspectorSection title='Related work' className='py-3'>
                    <YouTubeMerchRelationshipEditor
                      key={current.id}
                      profileId={profileId}
                      videoId={current.source.canonicalId}
                      merchProducts={merchProducts}
                      relationships={relationships}
                      disabled={!open}
                    />
                  </InspectorSection>
                ) : null}

                {isYouTubeVideo && current.source ? (
                  <InspectorSection title='Results' className='py-3'>
                    <YouTubeOptimizationPanel
                      key={current.id}
                      profileId={profileId}
                      videoId={current.source.canonicalId}
                      disabled={!open}
                    />
                  </InspectorSection>
                ) : null}

                {!isMerch && hasPostReleaseActivity ? (
                  <InspectorSection title='Activity' className='pt-3 last:pb-0'>
                    <PostReleasePanel
                      key={current.id}
                      asset={current}
                      creatorProfileId={profileId}
                      bundle={inspectorBundle}
                      onFindingChange={handleFindingChange}
                      disabled={!open}
                    />
                  </InspectorSection>
                ) : null}
              </>
            ) : isMerch ? (
              <InspectorEmpty message='No files for this merch item.' />
            ) : (
              <>
                <LibraryFilesPanel
                  asset={current}
                  downloads={inspectorBundle.downloads}
                  disabled={!open}
                  disabledTabIndex={closedTabIndex}
                  audioPreviewAction={
                    hasVerifiedLibraryAudioPreview(current) ? (
                      <PreviewActionButton
                        asset={current}
                        isPreviewPlaying={isPreviewPlaying}
                        onTogglePreview={onTogglePreview}
                        compact
                        disabledTabIndex={closedTabIndex}
                      />
                    ) : null
                  }
                  onAudioUploaded={onAudioUploaded}
                  onArtworkUploaded={onArtworkUploaded}
                />

                {!isYouTubeVideo ? (
                  <InspectorSection title='Share Files Privately'>
                    <LibraryShareDropCreator
                      releaseIds={[current.id]}
                      candidateAssets={shareCandidates.map(item => ({
                        id: item.id,
                        title: item.title,
                      }))}
                      defaultTitle={`${current.title} files`}
                    />
                  </InspectorSection>
                ) : null}
              </>
            )}
          </div>
        </TableContextMenu>
      ) : null}
    </InspectorShell>
  );
}

function LibraryStatusBar({
  visibleCount,
  totalCount,
  activePreviewTitle,
}: {
  readonly visibleCount: number;
  readonly totalCount: number;
  readonly activePreviewTitle: string | null;
}) {
  return (
    <div className='system-b-library-status-bar hidden h-(--app-shell-footer-row-height) shrink-0 items-center justify-between gap-3 border-t border-(--app-shell-frame-seam) px-(--app-shell-header-padding-x) sm:flex'>
      <span className='min-w-0 truncate'>
        {visibleCount} of {totalCount} Items
      </span>
      {activePreviewTitle ? (
        <span className='min-w-0 truncate text-right'>
          Playing {activePreviewTitle}
        </span>
      ) : null}
    </div>
  );
}

const EMPTY_MERCH_PRODUCTS: readonly LibraryMerchProductOption[] = [];
const EMPTY_WORK_LAUNCHES: readonly WorkLaunchSummary[] = [];

export function LibrarySurface({
  assets,
  profileId = null,
  artistHandle = null,
  canSyncSpotify = false,
  youtubeConnected = false,
  isImportingYouTube = false,
  youtubeImportDisabled = false,
  onImportYouTube,
  merchProducts = EMPTY_MERCH_PRODUCTS,
  relationships = EMPTY_RELATIONSHIPS,
  postReleaseBundle = EMPTY_LIBRARY_POST_RELEASE_BUNDLE,
  workLaunches = EMPTY_WORK_LAUNCHES,
}: {
  readonly assets: readonly LibraryReleaseAsset[];
  readonly profileId?: string | null;
  readonly artistHandle?: string | null;
  readonly canSyncSpotify?: boolean;
  readonly youtubeConnected?: boolean;
  readonly isImportingYouTube?: boolean;
  readonly youtubeImportDisabled?: boolean;
  readonly onImportYouTube?: () => void;
  readonly merchProducts?: readonly LibraryMerchProductOption[];
  readonly relationships?: readonly LibraryRelationshipView[];
  readonly postReleaseBundle?: LibraryPostReleaseBundle;
  /**
   * Canonical launch summaries (JOV-7472 read contract). Only launches scoped
   * to the selected work render; absent data means no press-kit slot is shown.
   */
  readonly workLaunches?: readonly WorkLaunchSummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mutate: syncSpotify, isPending: isSyncingSpotify } =
    useSyncReleasesFromSpotifyMutation(profileId ?? '');
  const handleSyncSpotify = useCallback(() => {
    syncSpotify(undefined, {
      onSuccess: result => {
        if (result.success) {
          toast.success(result.message);
          router.refresh();
          return;
        }
        toast.error(result.message);
      },
      onError: error => {
        void captureError('Failed to sync releases from Spotify', error, {
          context: 'library-empty-state',
          profileId,
          action: 'sync-from-spotify',
        });
        toast.error('Failed to sync from Spotify');
      },
    });
  }, [profileId, router, syncSpotify]);
  const { playbackState, toggleTrack, seek } = useTrackAudioPlayer();
  const [audioOverrides, setAudioOverrides] = useState<Record<string, string>>(
    {}
  );
  const [approvalStatusOverrides, setApprovalStatusOverrides] = useState<
    Record<string, LibraryApprovalStatus>
  >({});
  const [approvalSavingIds, setApprovalSavingIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [profileVisibilityOverrides, setProfileVisibilityOverrides] = useState<
    Record<string, LibraryReleaseAsset['profileVisibility']>
  >({});
  const [profileVisibilitySavingIds, setProfileVisibilitySavingIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [lifecycleStatusOverrides, setLifecycleStatusOverrides] = useState<
    Record<string, NonNullable<LibraryReleaseAsset['lifecycleStatus']>>
  >({});
  const [lifecycleSavingIds, setLifecycleSavingIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [shareOverrides, setShareOverrides] = useState<
    Record<string, LibraryAssetShareViewModel>
  >({});
  const [preset, setPreset] = useState<LibraryPresetId>(() =>
    parseLibraryViewParam(searchParams.get('view'))
  );
  const [stage, setStage] = useState(() =>
    parseLibraryStageParam(
      searchParams.get('stage') ?? searchParams.get('section')
    )
  );
  // Keep the server render and the browser's first hydration render identical.
  // A persisted view belongs to the post-hydration enhancement path; reading it
  // here would make a returning user's first client render differ from SSR.
  const [savedView, setSavedView] = useState<LibrarySavedViewId>('all');
  const [filters, setFilters] = useState<LibraryFilters>(() => emptyFilters());
  const [sort, setSort] = useState<LibrarySortKey>('releaseDate');
  const { view, setView } = useLibraryViewMode();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The element that opened the inspector, so Escape can hand focus back.
  const inspectorOpenerRef = useRef<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const { density: gridDensity, setDensity: setGridDensity } =
    useLibraryGridDensity();
  const isDesktopLayout = useBreakpoint('lg');
  const deferredFilters = useDeferredValue(filters);
  const deferredPreset = useDeferredValue(preset);
  const deferredStage = useDeferredValue(stage);
  const deferredSavedView = useDeferredValue(savedView);
  const deferredPills = useDeferredValue(pills);
  const deferredSort = useDeferredValue(sort);

  useEffect(() => {
    setPreset(parseLibraryViewParam(searchParams.get('view')));
    setStage(
      parseLibraryStageParam(
        searchParams.get('stage') ?? searchParams.get('section')
      )
    );
  }, [searchParams]);

  // Deep-link view-mode override (e.g. the /app/tracks redirect lands on
  // `/app/library?view=audio&mode=table`). A valid `mode` param wins over the
  // persisted preference and is itself persisted so the choice sticks.
  useEffect(() => {
    const modeParam = parseLibraryViewModeParam(searchParams.get('mode'));
    if (modeParam) {
      setView(modeParam);
    }
  }, [searchParams, setView]);

  useEffect(() => {
    setSavedView(readPersistedLibrarySavedView());
  }, []);

  // Version-stack duplicate ingests so each release renders as one row
  // (JOV-3089); product-graph enrichment then attaches to the surviving
  // canonical row so duplicate-version merch/post-release data is not dropped.
  const effectiveAssets = useMemo<readonly LibraryReleaseAsset[]>(
    () =>
      attachLibraryProductGraph(stackLibraryReleaseVersions(assets), {
        merchProducts,
        relationships,
        postReleaseBundle,
      }).map((asset): LibraryReleaseAsset => {
        const previewUrl = audioOverrides[asset.id];
        const hasPreviewOverride = Boolean(previewUrl);
        const approvalStatus =
          approvalStatusOverrides[asset.id] ?? asset.approvalStatus;
        const profileVisibility =
          profileVisibilityOverrides[asset.id] ?? asset.profileVisibility;
        const lifecycleStatus =
          lifecycleStatusOverrides[asset.id] ??
          asset.lifecycleStatus ??
          'active';
        const share = shareOverrides[asset.id] ?? asset.share ?? null;
        const assetKinds: readonly LibraryAssetKind[] =
          hasPreviewOverride && !asset.assetKinds.includes('preview')
            ? [...asset.assetKinds, 'preview']
            : asset.assetKinds;

        if (
          !hasPreviewOverride &&
          approvalStatus === asset.approvalStatus &&
          profileVisibility === asset.profileVisibility &&
          lifecycleStatus === (asset.lifecycleStatus ?? 'active') &&
          share === (asset.share ?? null)
        ) {
          return asset;
        }

        return {
          ...asset,
          ...(hasPreviewOverride
            ? { previewUrl, previewVerification: 'verified' as const }
            : {}),
          approvalStatus,
          profileVisibility,
          lifecycleStatus,
          share,
          assetKinds,
        };
      }),
    [
      approvalStatusOverrides,
      assets,
      audioOverrides,
      lifecycleStatusOverrides,
      merchProducts,
      postReleaseBundle,
      profileVisibilityOverrides,
      relationships,
      shareOverrides,
    ]
  );

  const visibleAssets = useMemo(() => {
    const presetPredicate =
      PRESETS.find(item => item.id === deferredPreset)?.predicate ??
      (() => true);
    const savedViewPredicate = getLibrarySavedViewPredicate(deferredSavedView);

    return effectiveAssets
      .filter(presetPredicate)
      .filter(savedViewPredicate)
      .filter(asset => libraryAssetMatchesStage(asset, deferredStage))
      .filter(asset => assetMatchesFilters(asset, deferredFilters))
      .filter(asset => assetMatchesPills(asset, deferredPills))
      .toSorted(compareAssets(deferredSort));
  }, [
    deferredFilters,
    deferredPills,
    deferredPreset,
    deferredSavedView,
    deferredSort,
    deferredStage,
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
  const approvalOptions = useMemo(
    () =>
      uniqueSorted(
        effectiveAssets.map(asset =>
          formatLibraryApprovalStatus(asset.approvalStatus)
        )
      ),
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

  const activeTilePlayback = useMemo<LibraryTilePlayback | undefined>(
    () =>
      activePreviewId
        ? {
            currentTime: playbackState.currentTime,
            duration: playbackState.duration,
            onSeek: seek,
          }
        : undefined,
    [activePreviewId, playbackState.currentTime, playbackState.duration, seek]
  );

  const handleTogglePreview = useCallback<LibraryPreviewToggle>(
    (asset, event) => {
      event?.stopPropagation();
      if (playbackState.activeTrackId === asset.id) {
        toggleTrack({ id: asset.id, title: asset.title }).catch(() => {
          toast.error('Unable to control playback right now');
        });
        return;
      }

      if (!hasVerifiedLibraryAudioPreview(asset)) return;

      toggleTrack({
        id: asset.id,
        title: asset.title,
        audioUrl: asset.previewUrl ?? undefined,
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

  const handleStageChange = useCallback(
    (next: (typeof STAGE_TABS)[number]) => {
      setStage(next);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('section');
      if (next === 'all') params.delete('stage');
      else params.set('stage', next);
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
    handleStageChange('all');
    handleSavedViewChange('all');
    setFilters(emptyFilters());
    setPills([]);
  }

  function openAsset(id: string) {
    const asset = effectiveAssets.find(item => item.id === id);
    if (asset && getLibraryItemKind(asset) === 'document') {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('section');
      params.set('document', id.replace(/^document-/, ''));
      const query = params.toString();
      router.replace(
        query ? `${APP_ROUTES.LIBRARY}?${query}` : APP_ROUTES.LIBRARY,
        { scroll: false }
      );
      return;
    }
    if (!drawerOpen) {
      const opener = document.activeElement;
      inspectorOpenerRef.current =
        opener instanceof HTMLElement && opener !== document.body
          ? opener
          : null;
    }
    setSelectedId(id);
    setDrawerOpen(true);
  }

  const closeAssetDrawer = useCallback(() => {
    setDrawerOpen(false);
    const opener = inspectorOpenerRef.current;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, []);

  // Escape closes the inspector from anywhere on the surface, not only when
  // focus is inside it, and returns focus to the item that opened it. Menus,
  // dialogs and popovers keep their own Escape; the inspector's handler marks
  // the event handled so it never closes twice.
  useEffect(() => {
    if (!drawerOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (resolveTableNavAction(event.key, event.target) !== 'close') return;
      if (isInteractiveOverlayTarget(event.target)) return;
      event.preventDefault();
      closeAssetDrawer();
    }
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [closeAssetDrawer, drawerOpen]);

  // Keyboard review (J/K/arrows move, Space plays, Enter inspects) for the
  // grid, and for every view while focus rests on the page. Focused table
  // rows handle their own keys and report moves through onCursor.
  const catalogRegionRef = useRef<HTMLDivElement | null>(null);
  const reviewKeyDownRef = useRef<(event: KeyboardEvent) => void>(() => {});
  function handleReviewKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const region = catalogRegionRef.current;
    const target = event.target;
    if (!region || isInteractiveOverlayTarget(target)) return;
    const onPage =
      target === null ||
      target === document.body ||
      target === document.documentElement;
    const inCatalog = target instanceof Node && region.contains(target);
    // From the toolbar (after clicking a view or stage control) only the
    // letter keys move; arrows, Space and Enter stay with that control.
    const inChrome =
      !inCatalog &&
      target instanceof Element &&
      Boolean(target.closest('[data-testid="library-surface"]')) &&
      Boolean(
        target.closest('button, input[type="radio"], input[type="checkbox"]')
      );
    if (
      !onPage &&
      !inCatalog &&
      !(inChrome && (event.key === 'j' || event.key === 'k'))
    ) {
      return;
    }
    const grid = region.querySelector<HTMLElement>('[data-library-grid]');
    const gridColumns =
      view === 'grid' && grid
        ? getComputedStyle(grid)
            .getPropertyValue('grid-template-columns')
            .split(' ')
            .filter(Boolean).length || 1
        : null;
    const step: LibraryReviewStep | null = inChrome
      ? { kind: 'move', delta: event.key === 'j' ? 1 : -1 }
      : resolveLibraryReviewStep(event.key, target, gridColumns);
    if (!step || visibleAssets.length === 0) return;

    const index = visibleAssets.findIndex(asset => asset.id === selectedId);
    const cursor = index === -1 ? null : visibleAssets[index];
    if (step.kind === 'play' || step.kind === 'open') {
      if (!cursor) return;
      event.preventDefault();
      if (step.kind === 'play') handleTogglePreview(cursor);
      else openAsset(cursor.id);
      return;
    }

    event.preventDefault();
    const last = visibleAssets.length - 1;
    const nextIndex =
      step.kind === 'edge'
        ? step.to === 'first'
          ? 0
          : last
        : index === -1
          ? step.delta > 0
            ? 0
            : last
          : Math.min(last, Math.max(0, index + step.delta));
    const next = visibleAssets[nextIndex];
    if (!next) return;
    setSelectedId(next.id);
    const focusTarget = findLibraryItemFocusTarget(region, next.id);
    focusTarget?.focus({ preventScroll: true });
    focusTarget?.scrollIntoView?.({ block: 'nearest' });
  }
  useEffect(() => {
    reviewKeyDownRef.current = handleReviewKeyDown;
  });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) =>
      reviewKeyDownRef.current(event);
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleApprovalStatusChange = useCallback(
    async (
      asset: LibraryReleaseAsset,
      approvalStatus: LibraryApprovalStatus
    ) => {
      if (!profileId || approvalStatus === asset.approvalStatus) {
        return;
      }

      setApprovalSavingIds(previous => new Set(previous).add(asset.id));
      setApprovalStatusOverrides(previous => ({
        ...previous,
        [asset.id]: approvalStatus,
      }));

      try {
        const response = await fetch('/api/library/approval-status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profileId,
            assetId: asset.id,
            itemKind: getLibraryItemKind(asset),
            approvalStatus,
          }),
        });

        if (!response.ok) {
          throw new Error('Approval status update failed');
        }
      } catch {
        toast.error('Unable to update approval status right now');
        setApprovalStatusOverrides(previous => ({
          ...previous,
          [asset.id]: asset.approvalStatus,
        }));
      } finally {
        setApprovalSavingIds(previous => {
          const next = new Set(previous);
          next.delete(asset.id);
          return next;
        });
      }
    },
    [profileId]
  );

  const handleProfileVisibilityChange = useCallback(
    async (
      asset: LibraryReleaseAsset,
      profileVisibility: LibraryReleaseAsset['profileVisibility']
    ) => {
      if (!profileId || profileVisibility === asset.profileVisibility) {
        return;
      }

      setProfileVisibilitySavingIds(previous =>
        new Set(previous).add(asset.id)
      );
      setProfileVisibilityOverrides(previous => ({
        ...previous,
        [asset.id]: profileVisibility,
      }));

      try {
        await updateLibraryProfileVisibility({
          profileId,
          assetId: asset.id,
          itemKind: getLibraryItemKind(asset),
          profileVisibility,
        });
      } catch {
        toast.error('Unable to update profile visibility right now');
        setProfileVisibilityOverrides(previous => ({
          ...previous,
          [asset.id]: asset.profileVisibility,
        }));
      } finally {
        setProfileVisibilitySavingIds(previous => {
          const next = new Set(previous);
          next.delete(asset.id);
          return next;
        });
      }
    },
    [profileId]
  );

  const handleLifecycleChange = useCallback(
    async (
      asset: LibraryReleaseAsset,
      lifecycleStatus: NonNullable<LibraryReleaseAsset['lifecycleStatus']>
    ) => {
      if (
        !profileId ||
        lifecycleStatus === (asset.lifecycleStatus ?? 'active')
      ) {
        return;
      }

      setLifecycleSavingIds(previous => new Set(previous).add(asset.id));
      setLifecycleStatusOverrides(previous => ({
        ...previous,
        [asset.id]: lifecycleStatus,
      }));

      try {
        if (getLibraryItemKind(asset) === 'merch') {
          const merchCardId = asset.id.replace(/^merch-/, '');
          if (lifecycleStatus === 'archived') {
            await archiveLibraryMerchCard({ merchCardId, profileId });
          } else {
            await restoreLibraryMerchCard({ merchCardId, profileId });
          }
        } else if (lifecycleStatus === 'archived') {
          await archiveLibraryRelease({ releaseId: asset.id });
        } else {
          await restoreRelease({ releaseId: asset.id });
        }
      } catch {
        toast.error(
          lifecycleStatus === 'archived'
            ? 'Unable to archive release right now'
            : 'Unable to restore release right now'
        );
        setLifecycleStatusOverrides(previous => ({
          ...previous,
          [asset.id]: asset.lifecycleStatus ?? 'active',
        }));
      } finally {
        setLifecycleSavingIds(previous => {
          const next = new Set(previous);
          next.delete(asset.id);
          return next;
        });
      }
    },
    [profileId]
  );

  const getContextMenuItems = useCallback<LibraryContextMenuBuilder>(
    asset =>
      libraryEntityActionsToContextMenuItems(
        buildLibraryEntityActions({
          asset,
          profileId,
          isPreviewPlaying: playingPreviewId === asset.id,
          isApprovalSaving: approvalSavingIds.has(asset.id),
          profileVisibility: {
            value: asset.profileVisibility,
            isSaving: profileVisibilitySavingIds.has(asset.id),
            onChange: handleProfileVisibilityChange,
          },
          lifecycle: {
            value: asset.lifecycleStatus ?? 'active',
            isSaving: lifecycleSavingIds.has(asset.id),
            onChange: handleLifecycleChange,
          },
          onTogglePreview: handleTogglePreview,
          onApprovalStatusChange: handleApprovalStatusChange,
        })
      ),
    [
      approvalSavingIds,
      handleApprovalStatusChange,
      handleLifecycleChange,
      handleProfileVisibilityChange,
      handleTogglePreview,
      lifecycleSavingIds,
      playingPreviewId,
      profileId,
      profileVisibilitySavingIds,
    ]
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
    filters.approvalStatuses.size +
    filters.releaseTypes.size +
    filters.assetKinds.size +
    filters.providers.size +
    (preset === 'all' ? 0 : 1);

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
            approvalOptions,
            hasOptions,
            totalCount: effectiveAssets.length,
            visibleCount: visibleAssets.length,
            triggerLabel:
              pills.length > 0
                ? `Filter Work (${pills.length})`
                : 'Filter Work',
            ariaLabel: 'Filter work',
            placeholder: 'Search work',
            allowedFields: [
              'artist',
              'title',
              'status',
              'approval',
              'has',
            ] as const,
          },
    [
      approvalOptions,
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

  const filterPanel = useMemo(
    () => (
      <LibraryFilterPanel
        assets={effectiveAssets}
        preset={preset}
        onPreset={handlePresetChange}
        savedView={savedView}
        onSavedView={handleSavedViewChange}
        filters={filters}
        onFilters={setFilters}
        onClearFilters={() => {
          handlePresetChange('all');
          setFilters(emptyFilters());
        }}
        className='max-h-full flex-1'
      />
    ),
    [
      effectiveAssets,
      filters,
      handlePresetChange,
      handleSavedViewChange,
      preset,
      savedView,
    ]
  );

  // Quick-apply suggestions surfaced next to the filter button (hover/focus
  // revealed). Each suggestion reuses a real, live filtering mechanism —
  // the "Type" suggestion switches the view preset, "Status"/"Approval"
  // add a FilterPill to the same pill-search state the header's Search
  // Library input writes to — so a click is never a decorative no-op.
  const suggestedFilters = useMemo<ToolbarFilterSuggestion[]>(() => {
    const suggestions: ToolbarFilterSuggestion[] = [];

    const typeCandidate = PRESETS.filter(
      item => item.id !== 'all' && item.id !== preset
    )
      .map(item => ({
        item,
        count: effectiveAssets.filter(item.predicate).length,
      }))
      .filter(entry => entry.count > 0)
      .toSorted((a, b) => b.count - a.count)[0];
    if (typeCandidate) {
      const { item } = typeCandidate;
      suggestions.push({
        id: `library-suggestion-type-${item.id}`,
        // No separate ariaLabel: the visible pill text is the accessible
        // name (WCAG 2.5.3 Label in Name) so voice-control users can refer
        // to the control by what it says.
        label: `Type · ${item.label}`,
        onSelect: () => handlePresetChange(item.id),
      });
    }

    const activeStatusValues = new Set(
      pills
        .filter(pill => pill.field === 'status')
        .flatMap(pill => pill.values.map(normalizePillValue))
    );
    const statusCandidate = Array.from(
      countBy(effectiveAssets, asset => [asset.status]).entries()
    )
      .filter(([status]) => !activeStatusValues.has(normalizePillValue(status)))
      .toSorted((a, b) => b[1] - a[1])[0];
    if (statusCandidate) {
      const [status] = statusCandidate;
      const label = formatReleaseStatus(status);
      suggestions.push({
        id: `library-suggestion-status-${status}`,
        label: `Status · ${label}`,
        onSelect: () => {
          setPills(previous => [
            ...previous,
            {
              id: newLibraryFilterPillId(),
              field: 'status',
              op: 'is',
              values: [status],
            },
          ]);
        },
      });
    }

    const activeApprovalValues = new Set(
      pills
        .filter(pill => pill.field === 'approval')
        .flatMap(pill => pill.values.map(normalizePillValue))
    );
    const approvalCandidate = Array.from(
      countBy(effectiveAssets, asset => [
        formatLibraryApprovalStatus(asset.approvalStatus),
      ]).entries()
    )
      .filter(([label]) => !activeApprovalValues.has(normalizePillValue(label)))
      .toSorted((a, b) => b[1] - a[1])[0];
    if (approvalCandidate) {
      const [label] = approvalCandidate;
      suggestions.push({
        id: `library-suggestion-approval-${label}`,
        label: `Approval · ${label}`,
        onSelect: () => {
          setPills(previous => [
            ...previous,
            {
              id: newLibraryFilterPillId(),
              field: 'approval',
              op: 'is',
              values: [label],
            },
          ]);
        },
      });
    }

    return suggestions.slice(0, 3);
  }, [effectiveAssets, handlePresetChange, pills, preset]);

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

  const handleArtworkUploaded = useCallback(
    (_assetId: string, _artworkUrl: string) => {
      router.refresh();
    },
    [router]
  );

  const assetDrawerPanel = useMemo(
    () => (
      <AssetDrawer
        asset={selectedAsset}
        open={drawerOpen}
        onClose={closeAssetDrawer}
        activePreviewId={activePreviewId}
        playingPreviewId={playingPreviewId}
        onTogglePreview={handleTogglePreview}
        onAudioUploaded={handleAudioUploaded}
        onArtworkUploaded={handleArtworkUploaded}
        getContextMenuItems={getContextMenuItems}
        profileId={profileId}
        approvalSavingIds={approvalSavingIds}
        artistHandle={artistHandle}
        shareCandidates={effectiveAssets.filter(
          item => getLibraryItemKind(item) === 'release'
        )}
        workLaunches={workLaunches}
        merchProducts={effectiveAssets.flatMap(asset =>
          getLibraryItemKind(asset) === 'merch' &&
          asset.source?.provider === 'merch'
            ? [{ id: asset.source.canonicalId, title: asset.title }]
            : []
        )}
        relationships={relationships}
        postReleaseBundle={postReleaseBundle}
        onApprovalStatusChange={handleApprovalStatusChange}
        onShareChange={handleShareChange}
      />
    ),
    [
      activePreviewId,
      approvalSavingIds,
      artistHandle,
      closeAssetDrawer,
      drawerOpen,
      effectiveAssets,
      getContextMenuItems,
      handleApprovalStatusChange,
      handleArtworkUploaded,
      handleAudioUploaded,
      handleShareChange,
      handleTogglePreview,
      playingPreviewId,
      postReleaseBundle,
      profileId,
      relationships,
      selectedAsset,
      workLaunches,
    ]
  );

  useRegisterRightPanel(assetDrawerPanel);

  if (effectiveAssets.length === 0) {
    return (
      <EmptyCatalog
        canSyncSpotify={canSyncSpotify}
        isSyncing={isSyncingSpotify}
        onSyncSpotify={handleSyncSpotify}
      />
    );
  }

  return (
    <WorkspacePage
      aria-label='Work'
      frame='content-container'
      contentPadding='none'
      surfaceMode='table'
      data-testid='library-surface'
      toolbar={
        <LibraryToolbar
          stage={stage}
          onStage={handleStageChange}
          sort={sort}
          onSort={setSort}
          view={view}
          onView={setView}
          gridDensity={gridDensity}
          onGridDensity={setGridDensity}
          visibleCount={visibleAssets.length}
          totalCount={effectiveAssets.length}
          filtersOpen={filtersOpen}
          onFiltersOpenChange={setFiltersOpen}
          activeFilterCount={activeFilterCount}
          filterPanel={filterPanel}
          isDesktop={isDesktopLayout}
          suggestedFilters={suggestedFilters}
          canSyncSpotify={canSyncSpotify}
          isSyncingSpotify={isSyncingSpotify}
          onSyncSpotify={handleSyncSpotify}
          youtubeConnected={youtubeConnected}
          isImportingYouTube={isImportingYouTube}
          youtubeImportDisabled={youtubeImportDisabled}
          onImportYouTube={onImportYouTube}
        />
      }
    >
      <NavigationDestinationReady destination='library' />
      <div
        id='library-catalog-panel'
        role='tabpanel'
        aria-labelledby={`library-stage-${stage}-tab`}
        data-testid='library-content-frame'
        className='flex h-full min-h-0 flex-1 overflow-hidden'
      >
        <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
          <div
            ref={catalogRegionRef}
            className='min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0'
          >
            {visibleAssets.length === 0 ? (
              <NoResults onReset={resetView} />
            ) : view === 'grid' ? (
              <AssetGrid
                assets={visibleAssets}
                selectedId={selectedId}
                activePreviewId={activePreviewId}
                playingPreviewId={playingPreviewId}
                activePlayback={activeTilePlayback}
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
                rowMode='compact'
                onSelect={openAsset}
                onCursor={setSelectedId}
                onRowToggle={handleTogglePreview}
                getContextMenuItems={getContextMenuItems}
              />
            ) : (
              <LibraryReleaseTable
                assets={visibleAssets}
                selectedId={selectedId}
                columns={LIBRARY_TABLE_COLUMNS}
                hideHeader
                rowTestIdPrefix='library-release-row'
                rowMode={LIBRARY_LIST_ROW_MODE}
                playingPreviewId={playingPreviewId}
                onSelect={openAsset}
                onCursor={setSelectedId}
                onRowToggle={handleTogglePreview}
                onTogglePreview={handleTogglePreview}
                getContextMenuItems={getContextMenuItems}
              />
            )}
          </div>
          <LibraryStatusBar
            visibleCount={visibleAssets.length}
            totalCount={effectiveAssets.length}
            activePreviewTitle={activePreviewTitle}
          />
        </div>
      </div>
    </WorkspacePage>
  );
}
