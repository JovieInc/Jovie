'use client';

import { useRouter } from 'next/navigation';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  connectAppleMusicArtist,
  deleteRelease,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { instantiateReleaseTasksFromCatalog } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
  DrawerButton,
  DrawerLoadingSkeleton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';
import type {
  ReleaseSidebarProps,
  TrackSidebarData,
} from '@/components/organisms/release-sidebar';
import {
  convertContextMenuItems,
  useAmbientListSelection,
} from '@/components/organisms/table';
import { PillSearch } from '@/components/shell/PillSearch';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useTableMeta } from '@/contexts/TableMetaContext';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { usePlanGate } from '@/lib/queries';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';
import { cn } from '@/lib/utils';
import { isFormElement } from '@/lib/utils/keyboard';
import { useImportPolling } from '../hooks/useImportPolling';
import { NewReleaseHeaderAction } from '../NewReleaseHeaderAction';
import { ReleaseStateBanners } from '../ReleaseStateBanners';
import {
  restoreReleaseArtwork,
  uploadReleaseArtwork,
} from '../release-artwork-actions';
import {
  computeSmartLinkGating,
  type SmartLinkLockReason,
} from '../smart-link-gating';
import { useReleaseProviderMatrix } from '../useReleaseProviderMatrix';
import { releaseStatusToShell } from './release-adapters';
import { ShellReleaseRow } from './ShellReleaseRow';

const ReleaseSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.ReleaseSidebar,
  }))
);

const TrackSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.TrackSidebar,
  }))
);

const AddReleaseSidebar = lazy(() =>
  import('../AddReleaseSidebar').then(m => ({
    default: m.AddReleaseSidebar,
  }))
);

const SpotifyConnectDialog = lazy(() =>
  import('../SpotifyConnectDialog').then(m => ({
    default: m.SpotifyConnectDialog,
  }))
);

const ArtistSearchCommandPalette = lazy(() =>
  import('@/components/organisms/artist-search-palette').then(m => ({
    default: m.ArtistSearchCommandPalette,
  }))
);

const ReleasePlanWizard = lazy(() =>
  import('../ReleasePlanWizard').then(m => ({
    default: m.ReleasePlanWizard,
  }))
);

const RELEASE_DETAIL_PANEL_WIDTH = 388;

/**
 * Match a release against a single filter value. Field-level operator
 * (`is`/`is not`) is applied by the caller; this returns whether the value
 * matches at all. Production data drops the `album` and `bpm`/`key` fields
 * (those are sandbox-only); we mirror the shell-v1 set otherwise.
 */
function releaseMatchesField(
  release: ReleaseViewModel,
  field: FilterField,
  value: string
): boolean {
  const v = value.toLowerCase();
  switch (field) {
    case 'artist':
      return (release.artistNames ?? []).some(name =>
        name.toLowerCase().includes(v)
      );
    case 'title':
      return release.title.toLowerCase().includes(v);
    case 'album':
      return release.title.toLowerCase().includes(v);
    case 'status':
      return releaseStatusToShell(release.status) === value;
    case 'has':
      if (value === 'video') return Boolean(release.hasVideoLinks);
      if (value === 'canvas') {
        const status = release.canvasStatus;
        return status === 'generated' || status === 'uploaded';
      }
      return false;
  }
}

/**
 * Apply the pill list to a release. Pills are AND-combined across fields;
 * values within a single pill are OR-combined; the `op` flips the match.
 */
function applyPills(
  releases: readonly ReleaseViewModel[],
  pills: readonly FilterPill[]
): ReleaseViewModel[] {
  if (pills.length === 0) return [...releases];
  return releases.filter(r =>
    pills.every(pill => {
      const anyValueMatches = pill.values.some(v =>
        releaseMatchesField(r, pill.field, v)
      );
      return pill.op === 'is' ? anyValueMatches : !anyValueMatches;
    })
  );
}

function distinctValues(
  releases: readonly ReleaseViewModel[],
  pick: (r: ReleaseViewModel) => string | string[] | undefined
): string[] {
  const seen = new Set<string>();
  for (const r of releases) {
    const picked = pick(r);
    if (Array.isArray(picked)) {
      for (const v of picked) if (v) seen.add(v);
    } else if (picked) {
      seen.add(picked);
    }
    if (seen.size >= 200) break;
  }
  return [...seen];
}

// ── Empty / list content ───────────────────────────────────────────────────────

interface ReleasesListContentProps {
  readonly showEmptyState: boolean;
  readonly showConnectedEmptyState: boolean;
  readonly visibleReleases: readonly ReleaseViewModel[];
  readonly selectedReleaseId: string | null;
  readonly pills: readonly FilterPill[];
  readonly canCreateManualReleases: boolean;
  readonly isSyncing: boolean;
  readonly actionMenusByReleaseId: Map<
    string,
    ReturnType<typeof convertContextMenuItems>
  >;
  readonly isSmartLinkLocked: (id: string) => boolean;
  readonly getSmartLinkLockReason: (id: string) => SmartLinkLockReason | null;
  readonly onConnectSpotify: () => void;
  readonly onNewRelease: () => void;
  readonly onSync: () => void;
  readonly onSelect: (release: ReleaseViewModel) => void;
  readonly onClearFilters: () => void;
}

function ReleasesListContent({
  showEmptyState,
  showConnectedEmptyState,
  visibleReleases,
  selectedReleaseId,
  pills,
  canCreateManualReleases,
  isSyncing,
  actionMenusByReleaseId,
  isSmartLinkLocked,
  getSmartLinkLockReason,
  onConnectSpotify,
  onNewRelease,
  onSync,
  onSelect,
  onClearFilters,
}: ReleasesListContentProps) {
  if (showEmptyState) {
    return (
      <div className='py-12 grid place-items-center text-center'>
        <div className='max-w-sm'>
          <div className='text-[13px] font-caption text-primary-token'>
            Connect Spotify to get started
          </div>
          <p className='mt-1 text-[12px] text-tertiary-token leading-[1.5]'>
            Sync your catalog from Spotify or add a release manually to start
            generating smart links.
          </p>
          <div className='mt-3 flex flex-wrap items-center justify-center gap-2'>
            <DrawerButton
              tone='primary'
              onClick={onConnectSpotify}
              className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
              data-testid='shell-releases-connect-spotify'
            >
              <Icon name='RefreshCw' className='h-4 w-4' aria-hidden='true' />
              Connect Spotify
            </DrawerButton>
            {canCreateManualReleases && (
              <DrawerButton
                onClick={onNewRelease}
                className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                data-testid='shell-releases-create-empty'
              >
                <Icon name='Plus' className='h-4 w-4' aria-hidden='true' />
                Add manually
              </DrawerButton>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (showConnectedEmptyState) {
    return (
      <div className='py-12 grid place-items-center text-center'>
        <DrawerSurfaceCard
          variant='card'
          className='flex min-h-[212px] flex-col items-center justify-center px-5 py-9 text-center'
          testId='shell-releases-empty-state-connected'
        >
          <div className='mb-2.5 flex h-9 w-9 items-center justify-center rounded-[10px] border border-subtle bg-surface-1'>
            <Icon
              name='Disc3'
              className='h-4 w-4 text-tertiary-token'
              aria-hidden='true'
            />
          </div>
          <h3 className='text-app font-caption text-primary-token'>
            No releases yet
          </h3>
          <p className='mt-0.5 max-w-sm text-xs leading-[17px] text-secondary-token'>
            {canCreateManualReleases
              ? 'Sync from Spotify or create one manually to start generating smart links.'
              : 'Sync from Spotify to start generating smart links.'}
          </p>
          <div className='mt-3 flex flex-wrap items-center justify-center gap-2.5'>
            <DrawerButton
              tone='primary'
              disabled={isSyncing}
              onClick={onSync}
              className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
              data-testid='shell-releases-sync-empty-state'
            >
              <Icon
                name={isSyncing ? 'Loader2' : 'RefreshCw'}
                className={cn(
                  'h-4 w-4',
                  isSyncing && 'animate-spin motion-reduce:animate-none'
                )}
                aria-hidden='true'
              />
              {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
            </DrawerButton>
            {canCreateManualReleases && (
              <DrawerButton
                onClick={onNewRelease}
                className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                data-testid='shell-releases-create-connected-empty'
              >
                <Icon name='Plus' className='h-4 w-4' aria-hidden='true' />
                Add manually
              </DrawerButton>
            )}
          </div>
        </DrawerSurfaceCard>
      </div>
    );
  }

  if (visibleReleases.length === 0) {
    return (
      <div className='py-12 grid place-items-center text-center'>
        <div>
          <div className='text-[13px] font-caption text-secondary-token'>
            No releases match your filters
          </div>
          {pills.length > 0 ? (
            <button
              type='button'
              onClick={onClearFilters}
              className='mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors duration-subtle ease-out'
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      role='listbox'
      aria-label='Releases'
      className='py-1.5 space-y-px px-2'
    >
      {visibleReleases.map(r => (
        <ShellReleaseRow
          key={r.id}
          release={r}
          isSelected={r.id === selectedReleaseId}
          onSelect={() => onSelect(r)}
          actionMenuItems={actionMenusByReleaseId.get(r.id)}
          smartLinkLockReason={
            isSmartLinkLocked(r.id) ? getSmartLinkLockReason(r.id) : null
          }
        />
      ))}
    </div>
  );
}

export interface ShellReleasesViewProps {
  readonly releases: readonly ReleaseViewModel[];
  readonly providerConfig: Record<
    ProviderKey,
    { readonly label: string; readonly accent: string }
  >;
  readonly primaryProviders: ProviderKey[];
  readonly artistName?: string | null;
  readonly allowArtworkDownloads?: boolean;
  readonly spotifyConnected?: boolean;
  readonly appleMusicConnected?: boolean;
  readonly initialImporting?: boolean;
  readonly initialTotalCount?: number;
}

/**
 * Top-level Linear-style releases view, rendered behind DESIGN_V1.
 *
 * Restores parity with the production `ReleaseProviderMatrix` (create / sync /
 * import progress / Apple Music sync / soft-cap gates / smart-link locks)
 * while keeping the shell-style row list, PillSearch header, and production
 * release drawer.
 */
export function ShellReleasesView({
  releases,
  providerConfig,
  primaryProviders,
  artistName: initialArtistName,
  allowArtworkDownloads = false,
  spotifyConnected = false,
  appleMusicConnected = false,
  initialImporting = false,
  initialTotalCount = 0,
}: ShellReleasesViewProps) {
  const router = useRouter();
  const { setHeaderActions } = useSetHeaderActions();
  const albumArtFlagEnabled = useCodeFlag('ALBUM_ART_GENERATION');

  const [searchOpen, setSearchOpen] = useState(false);
  const [pills, setPills] = useState<FilterPill[]>([]);
  const [isConnected, setIsConnected] = useState(spotifyConnected);
  const [artistName, setArtistName] = useState<string | null>(
    initialArtistName ?? null
  );
  const [isImporting, setIsImporting] = useState(initialImporting);
  const [spotifySearchOpen, setSpotifySearchOpen] = useState(false);
  const [addReleaseOpen, setAddReleaseOpen] = useState(false);
  const [isAmConnected, setIsAmConnected] = useState(appleMusicConnected);
  const [amPaletteOpen, setAmPaletteOpen] = useState(false);
  const [postCreateRelease, setPostCreateRelease] =
    useState<ReleaseViewModel | null>(null);
  const [isPostCreatePlanModalOpen, setIsPostCreatePlanModalOpen] =
    useState(false);
  const [isGeneratingReleasePlan, setIsGeneratingReleasePlan] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseViewModel | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTrack, setEditingTrack] = useState<TrackSidebarData | null>(
    null
  );

  const releaseRows = useMemo(() => [...releases], [releases]);
  const {
    rows,
    setRows,
    editingRelease,
    isSaving,
    isSyncing,
    handleReleaseCreated,
    handleReleaseArtworkUploaded,
    openEditor,
    closeEditor,
    updateRow,
    handleCopy,
    handleSync,
    handleRefreshRelease,
    refreshingReleaseId,
    handleRescanIsrc,
    isRescanningIsrc,
    handleCanvasStatusUpdate,
    handleAddUrl,
    handleSaveMetadata,
    handleSavePrimaryIsrc,
    handleSaveLyrics,
    handleSaveTargetPlaylists,
    handleFormatLyrics,
    isLyricsSaving,
  } = useReleaseProviderMatrix({
    releases: releaseRows,
    providerConfig,
    primaryProviders,
  });

  const planGate = usePlanGate();
  const {
    smartLinksLimit,
    isPro,
    canCreateManualReleases,
    canGenerateAlbumArt,
    canGenerateReleasePlans,
    canEditSmartLinks,
    canAccessFutureReleases,
  } = planGate;
  const isReleasePlanGateLoading = planGate.isLoading || planGate.isError;
  const showGenerateAlbumArtAction =
    albumArtFlagEnabled && Boolean(canGenerateAlbumArt);

  // Smart-link gating: partition releases by released/scheduled + apply cap.
  const { unlockedIds, lockReasons, releasedCount, unreleasedCount } = useMemo(
    () =>
      computeSmartLinkGating(rows, smartLinksLimit, canAccessFutureReleases),
    [rows, smartLinksLimit, canAccessFutureReleases]
  );

  const isSmartLinkLocked = useCallback(
    (releaseId: string) => {
      if (!unlockedIds) return false;
      return !unlockedIds.has(releaseId);
    },
    [unlockedIds]
  );

  const getSmartLinkLockReason = useCallback(
    (releaseId: string): SmartLinkLockReason | null => {
      return lockReasons.get(releaseId) ?? null;
    },
    [lockReasons]
  );

  const visibleReleases = useMemo(() => applyPills(rows, pills), [rows, pills]);

  const artistOptions = useMemo(
    () => distinctValues(rows, r => r.artistNames),
    [rows]
  );
  const titleOptions = useMemo(
    () => distinctValues(rows, r => r.title),
    [rows]
  );
  const albumOptions = titleOptions;

  const handleSelect = useCallback(
    (release: ReleaseViewModel) => {
      openEditor(release);
    },
    [openEditor]
  );

  const selectedReleaseIndex = useMemo(() => {
    if (!editingRelease) return null;
    const idx = visibleReleases.findIndex(r => r.id === editingRelease.id);
    return idx === -1 ? null : idx;
  }, [editingRelease, visibleReleases]);

  const handleAmbientSelect = useCallback(
    (index: number) => {
      const target = visibleReleases[index];
      if (target) openEditor(target);
    },
    [openEditor, visibleReleases]
  );

  useAmbientListSelection({
    enabled: visibleReleases.length > 0,
    count: visibleReleases.length,
    selectedIndex: selectedReleaseIndex,
    onSelect: handleAmbientSelect,
  });

  const openTrackDrawer = useCallback(
    (trackData: TrackSidebarData) => {
      closeEditor();
      setAddReleaseOpen(false);
      setEditingTrack(current =>
        current?.id === trackData.id ? null : trackData
      );
    },
    [closeEditor]
  );

  const closeTrackDrawer = useCallback(() => {
    setEditingTrack(null);
  }, []);

  const handleBackToReleaseFromTrack = useCallback(
    (releaseId: string) => {
      const release = rows.find(r => r.id === releaseId);
      if (release) {
        setEditingTrack(null);
        openEditor(release);
      }
    },
    [openEditor, rows]
  );

  const handleArtworkUpload = uploadReleaseArtwork;
  const handleArtworkRevert = restoreReleaseArtwork;

  const handleGenerateAlbumArt = useCallback(
    (release: ReleaseViewModel) => {
      openChatWithPrompt(
        `Generate album art for this release and attach it to the provided release ID.\n${JSON.stringify(
          {
            releaseId: release.id,
            releaseTitle: release.title,
            instruction: 'Show three options.',
          }
        )}`,
        router
      );
    },
    [router]
  );

  const isDistributed = useCallback((release: ReleaseViewModel) => {
    return (
      !!release.primaryIsrc &&
      !!release.releaseDate &&
      new Date(release.releaseDate) <= new Date()
    );
  }, []);

  const handleDeleteRequest = useCallback(
    (releaseId: string) => {
      const release = rows.find(r => r.id === releaseId);
      if (release) {
        setDeleteTarget(release);
      }
    },
    [rows]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteRelease({ releaseId: deleteTarget.id });
      if (result.success) {
        setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
        toast.success(`"${deleteTarget.title}" deleted.`);
      } else {
        toast.error(result.message ?? 'Failed to delete release.');
      }
    } catch {
      toast.error('Failed to delete release.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, setRows]);

  const actionMenusByReleaseId = useMemo(() => {
    return new Map(
      visibleReleases.map(release => [
        release.id,
        convertContextMenuItems(
          buildReleaseActions({
            release,
            onEdit: openEditor,
            onCopy: handleCopy,
            artistName,
            isSmartLinkLocked,
            getSmartLinkLockReason,
            onDelete: handleDeleteRequest,
            canGenerateAlbumArt: showGenerateAlbumArtAction,
            onGenerateAlbumArt: handleGenerateAlbumArt,
          })
        ),
      ])
    );
  }, [
    artistName,
    getSmartLinkLockReason,
    handleCopy,
    handleDeleteRequest,
    handleGenerateAlbumArt,
    isSmartLinkLocked,
    openEditor,
    showGenerateAlbumArtAction,
    visibleReleases,
  ]);

  // ── Spotify connect / import wiring ──

  const handleArtistConnected = useCallback(
    (newReleases: ReleaseViewModel[], newArtistName: string) => {
      setIsConnected(true);
      setArtistName(newArtistName);
      if (newReleases.length > 0) {
        setRows(newReleases);
        setIsImporting(false);
      }
    },
    [setRows]
  );

  const handleImportStart = useCallback((importingArtistName: string) => {
    setIsImporting(true);
    setArtistName(importingArtistName);
  }, []);

  const handleReleasesFromPolling = useCallback(
    (polledReleases: ReleaseViewModel[]) => {
      setRows(polledReleases);
    },
    [setRows]
  );

  const handleImportComplete = useCallback(() => {
    setIsImporting(false);
  }, []);

  const { importedCount, totalCount } = useImportPolling({
    enabled: isImporting,
    initialTotalCount,
    onReleasesUpdate: handleReleasesFromPolling,
    onImportComplete: handleImportComplete,
  });

  const handleAppleMusicConnect = useCallback(
    async (artist: {
      id: string;
      name: string;
      url: string;
      imageUrl?: string;
    }) => {
      try {
        const result = await connectAppleMusicArtist({
          externalArtistId: artist.id,
          externalArtistName: artist.name,
          externalArtistUrl: artist.url,
          externalArtistImageUrl: artist.imageUrl,
        });
        if (result.success) {
          setIsAmConnected(true);
          toast.success(result.message);
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to connect Apple Music'
        );
      }
    },
    []
  );

  const handleMatchStatusChange = useCallback(
    (connected: boolean, _name: string | null) => {
      setIsAmConnected(connected);
    },
    []
  );

  // ── New-release affordance (sync / add manually) ──

  const handleNewRelease = useCallback(() => {
    closeEditor();
    setAddReleaseOpen(true);
  }, [closeEditor]);

  const closeAddRelease = useCallback(() => setAddReleaseOpen(false), []);

  const handleAddReleaseCreated = useCallback(
    (createdRelease: ReleaseViewModel) => {
      handleReleaseCreated(createdRelease, { openEditor: false });
      setAddReleaseOpen(false);
      closeEditor();
      setPostCreateRelease(createdRelease);
      setIsPostCreatePlanModalOpen(true);
    },
    [closeEditor, handleReleaseCreated]
  );

  const closePostCreatePlanModal = useCallback(() => {
    if (isGeneratingReleasePlan) {
      return;
    }

    setIsPostCreatePlanModalOpen(false);
    setPostCreateRelease(null);
  }, [isGeneratingReleasePlan]);

  const handleGenerateReleasePlan = useCallback(
    async (ctx?: ReleaseContext) => {
      if (!postCreateRelease || isGeneratingReleasePlan) {
        return;
      }

      setIsGeneratingReleasePlan(true);
      try {
        if (ctx) {
          await instantiateReleaseTasksFromCatalog(postCreateRelease.id, ctx);
        } else {
          await instantiateReleaseTasks(postCreateRelease.id);
        }
        const releaseTasksPath = APP_ROUTES.DASHBOARD_RELEASE_TASKS.replace(
          '[releaseId]',
          postCreateRelease.id
        );
        setIsPostCreatePlanModalOpen(false);
        setPostCreateRelease(null);
        router.push(releaseTasksPath);
      } catch (error) {
        captureError('Failed to generate release plan', error, {
          context: 'shell-releases-view',
          releaseId: postCreateRelease.id,
          action: 'generate-release-plan',
        });
        toast.error('Failed to generate the release plan. Try again.');
      } finally {
        setIsGeneratingReleasePlan(false);
      }
    },
    [isGeneratingReleasePlan, postCreateRelease, router]
  );

  // ── Sidebar / right-panel registration ──

  const handleReleaseChange = useCallback(
    (updated: ReleaseViewModel) => {
      updateRow(updated);
    },
    [updateRow]
  );

  const isReleaseSidebarOpen = Boolean(editingRelease);
  const isTrackSidebarOpen = Boolean(editingTrack);
  const isSidebarOpen =
    isReleaseSidebarOpen || isTrackSidebarOpen || addReleaseOpen;

  const sidebarPanel = useMemo(() => {
    if (isTrackSidebarOpen) {
      return (
        <Suspense
          fallback={
            <DrawerLoadingSkeleton
              ariaLabel='Loading track details'
              width={RELEASE_DETAIL_PANEL_WIDTH}
              showTabs={false}
              contentRows={5}
            />
          }
        >
          <TrackSidebar
            track={editingTrack}
            isOpen={isTrackSidebarOpen}
            width={RELEASE_DETAIL_PANEL_WIDTH}
            onClose={closeTrackDrawer}
            onBackToRelease={handleBackToReleaseFromTrack}
          />
        </Suspense>
      );
    }

    if (!isReleaseSidebarOpen) {
      if (addReleaseOpen && canCreateManualReleases) {
        return (
          <Suspense
            fallback={
              <DrawerLoadingSkeleton
                ariaLabel='Loading add release form'
                width={RELEASE_DETAIL_PANEL_WIDTH}
                showTabs={false}
                contentRows={6}
              />
            }
          >
            <AddReleaseSidebar
              isOpen={addReleaseOpen}
              artistName={artistName}
              onClose={closeAddRelease}
              onCreated={handleAddReleaseCreated}
              onArtworkUploaded={handleReleaseArtworkUploaded}
            />
          </Suspense>
        );
      }
      return null;
    }

    const releaseSidebarProps: ReleaseSidebarProps = {
      release: editingRelease,
      mode: 'admin',
      isOpen: true,
      width: RELEASE_DETAIL_PANEL_WIDTH,
      providerConfig,
      artistName,
      onClose: closeEditor,
      onRefresh: editingRelease
        ? () => handleRefreshRelease(editingRelease.id)
        : undefined,
      isRefreshing: refreshingReleaseId === editingRelease?.id,
      onAddDspLink: handleAddUrl,
      onRescanIsrc: editingRelease
        ? () => handleRescanIsrc(editingRelease.id)
        : undefined,
      isRescanningIsrc,
      onArtworkUpload: handleArtworkUpload,
      onArtworkRevert: handleArtworkRevert,
      onReleaseChange: handleReleaseChange,
      onSaveMetadata: handleSaveMetadata,
      onSavePrimaryIsrc: handleSavePrimaryIsrc,
      onSaveLyrics: handleSaveLyrics,
      onSaveTargetPlaylists: handleSaveTargetPlaylists,
      onFormatLyrics: handleFormatLyrics,
      isLyricsSaving,
      isSaving,
      allowDownloads: allowArtworkDownloads,
      readOnly: !canEditSmartLinks,
      canGenerateAlbumArt: showGenerateAlbumArtAction,
      onGenerateAlbumArt: handleGenerateAlbumArt,
      showCredits: true,
      designV1: true,
      onCanvasStatusUpdate: handleCanvasStatusUpdate,
      onTrackClick: openTrackDrawer,
    };

    return (
      <Suspense
        fallback={
          <DrawerLoadingSkeleton
            ariaLabel='Loading release details'
            width={RELEASE_DETAIL_PANEL_WIDTH}
            showTabs
            contentRows={6}
          />
        }
      >
        <ReleaseSidebar {...releaseSidebarProps} />
      </Suspense>
    );
  }, [
    addReleaseOpen,
    allowArtworkDownloads,
    artistName,
    canCreateManualReleases,
    canEditSmartLinks,
    closeAddRelease,
    closeEditor,
    closeTrackDrawer,
    editingRelease,
    editingTrack,
    handleAddReleaseCreated,
    handleAddUrl,
    handleArtworkRevert,
    handleArtworkUpload,
    handleBackToReleaseFromTrack,
    handleCanvasStatusUpdate,
    handleFormatLyrics,
    handleGenerateAlbumArt,
    handleRefreshRelease,
    handleReleaseArtworkUploaded,
    handleReleaseChange,
    handleRescanIsrc,
    handleSaveLyrics,
    handleSaveMetadata,
    handleSavePrimaryIsrc,
    handleSaveTargetPlaylists,
    isLyricsSaving,
    isReleaseSidebarOpen,
    isRescanningIsrc,
    isSaving,
    isTrackSidebarOpen,
    openTrackDrawer,
    providerConfig,
    refreshingReleaseId,
    showGenerateAlbumArtAction,
  ]);

  useRegisterRightPanel(sidebarPanel);

  // ── Header actions: NewReleaseHeaderAction + search trigger / PillSearch ──

  const selectedReleaseId = editingRelease?.id ?? null;
  const releaseCountSuffix =
    visibleReleases.length === rows.length ? '' : ` of ${rows.length}`;

  const handleClearFilters = useCallback(() => {
    setPills([]);
  }, []);

  const headerActions = useMemo(() => {
    const searchNode = searchOpen ? (
      <div className='w-[min(560px,calc(100vw-2rem))] rounded-lg border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] px-2 py-1 shadow-[0_10px_32px_rgba(0,0,0,0.16)] sm:w-[440px] lg:w-[520px]'>
        <PillSearch
          active={searchOpen}
          pills={pills}
          onPillsChange={setPills}
          artistOptions={artistOptions}
          titleOptions={titleOptions}
          albumOptions={albumOptions}
          ariaLabel='Filter releases'
          placeholder='Filter releases — / for fields'
          onClose={() => {
            setSearchOpen(false);
            setPills([]);
          }}
        />
      </div>
    ) : (
      <button
        type='button'
        data-app-search-trigger='true'
        onClick={() => setSearchOpen(true)}
        className='inline-flex h-7 items-center gap-1.5 rounded-md border border-(--linear-app-shell-border) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_94%,transparent)] px-2 text-[12px] text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        aria-label='Search releases'
        title='Search releases (/)'
      >
        <Icon name='Search' className='h-3.5 w-3.5' aria-hidden='true' />
        <span className='hidden sm:inline'>Search Releases</span>
        <span className='hidden text-tertiary-token lg:inline'>/</span>
        <span className='tabular-nums text-tertiary-token'>
          {visibleReleases.length}
          {releaseCountSuffix}
        </span>
      </button>
    );

    return (
      <div className='flex items-center gap-2'>
        {searchNode}
        <NewReleaseHeaderAction
          canCreateManualReleases={canCreateManualReleases}
          isSyncing={isSyncing}
          onSyncSpotify={handleSync}
          onCreateManual={handleNewRelease}
        />
      </div>
    );
  }, [
    albumOptions,
    artistOptions,
    canCreateManualReleases,
    handleNewRelease,
    handleSync,
    isSyncing,
    pills,
    releaseCountSuffix,
    searchOpen,
    titleOptions,
    visibleReleases.length,
  ]);

  useEffect(() => {
    setHeaderActions(headerActions);
    return () => setHeaderActions(null);
  }, [headerActions, setHeaderActions]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      const hasModifier =
        event.metaKey || event.ctrlKey || event.altKey || event.shiftKey;

      if (event.key === '/' && !hasModifier) {
        if (isFormElement(event.target)) return;
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (event.key === 'Escape' && searchOpen) {
        const target = event.target as HTMLElement | null;
        if (target?.matches('[data-app-search-field="true"]')) return;
        event.preventDefault();
        setSearchOpen(false);
      }
    }

    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [searchOpen]);

  // ── Drawer toggle integration with table chrome (parity with production) ──

  const { setTableMeta } = useTableMeta();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    const toggle = () => {
      if (editingTrack) {
        closeTrackDrawer();
      } else if (editingRelease) {
        closeEditor();
      } else if (rowsRef.current.length > 0) {
        openEditor(rowsRef.current[0]);
      }
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? RELEASE_DETAIL_PANEL_WIDTH : 0,
    });
  }, [
    closeEditor,
    closeTrackDrawer,
    editingRelease,
    editingTrack,
    isSidebarOpen,
    openEditor,
    rows.length,
    setTableMeta,
  ]);

  // ── Conditional state surfaces ──

  const showImportProgress = isImporting;
  const showEmptyState = !isConnected && !isImporting && rows.length === 0;
  const showConnectedEmptyState =
    isConnected && rows.length === 0 && !isImporting;

  return (
    <>
      <section
        aria-label='Releases'
        className='flex h-full flex-col focus:outline-none'
        data-design-v1-releases='true'
        data-testid='shell-releases-view'
      >
        <ReleaseStateBanners
          rows={rows}
          showImportProgress={showImportProgress}
          showReleasesTable={rows.length > 0}
          artistName={artistName}
          importedCount={importedCount}
          totalCount={totalCount}
          isAppleMusicConnected={isAmConnected}
          isImporting={isImporting}
          isSpotifyConnected={isConnected}
          isPro={isPro}
          canAccessFutureReleases={canAccessFutureReleases}
          releasedCount={releasedCount}
          unreleasedCount={unreleasedCount}
          onAppleMusicMatchStatusChange={handleMatchStatusChange}
        />

        <div className='flex-1 min-h-0 overflow-y-auto'>
          <ReleasesListContent
            showEmptyState={showEmptyState}
            showConnectedEmptyState={showConnectedEmptyState}
            visibleReleases={visibleReleases}
            selectedReleaseId={selectedReleaseId}
            pills={pills}
            canCreateManualReleases={canCreateManualReleases}
            isSyncing={isSyncing}
            actionMenusByReleaseId={actionMenusByReleaseId}
            isSmartLinkLocked={isSmartLinkLocked}
            getSmartLinkLockReason={getSmartLinkLockReason}
            onConnectSpotify={() => setSpotifySearchOpen(true)}
            onNewRelease={handleNewRelease}
            onSync={handleSync}
            onSelect={handleSelect}
            onClearFilters={handleClearFilters}
          />
        </div>
      </section>

      <Suspense
        fallback={
          amPaletteOpen ? (
            <DialogLoadingSkeleton
              open={amPaletteOpen}
              onClose={() => setAmPaletteOpen(false)}
              size='lg'
              rows={3}
            />
          ) : null
        }
      >
        {amPaletteOpen ? (
          <ArtistSearchCommandPalette
            open={amPaletteOpen}
            onOpenChange={setAmPaletteOpen}
            provider='apple_music'
            onArtistSelect={handleAppleMusicConnect}
          />
        ) : null}
      </Suspense>

      <Suspense
        fallback={
          spotifySearchOpen ? (
            <DialogLoadingSkeleton
              open={spotifySearchOpen}
              onClose={() => setSpotifySearchOpen(false)}
              size='lg'
              rows={3}
            />
          ) : null
        }
      >
        <SpotifyConnectDialog
          open={spotifySearchOpen}
          onOpenChange={setSpotifySearchOpen}
          onConnected={handleArtistConnected}
          onImportStart={handleImportStart}
        />
      </Suspense>

      <Suspense
        fallback={
          isPostCreatePlanModalOpen && postCreateRelease !== null ? (
            <DialogLoadingSkeleton
              open
              onClose={closePostCreatePlanModal}
              size='sm'
              rows={3}
            />
          ) : null
        }
      >
        {isPostCreatePlanModalOpen && postCreateRelease !== null ? (
          <ReleasePlanWizard
            open
            releaseTitle={postCreateRelease.title}
            isGateLoading={isReleasePlanGateLoading}
            canGenerateReleasePlans={canGenerateReleasePlans}
            isGeneratingReleasePlan={isGeneratingReleasePlan}
            onClose={closePostCreatePlanModal}
            onSubmit={handleGenerateReleasePlan}
          />
        ) : null}
      </Suspense>

      {deleteTarget && (
        <ConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setDeleteTarget(null);
          }}
          title={
            isDistributed(deleteTarget)
              ? 'Release is distributed'
              : `Delete "${deleteTarget.title}"?`
          }
          description={
            isDistributed(deleteTarget)
              ? 'Remove this release from distribution before deleting it.'
              : 'This will remove the release from your dashboard and public profile.'
          }
          confirmLabel={isDistributed(deleteTarget) ? 'OK' : 'Delete'}
          variant={isDistributed(deleteTarget) ? 'default' : 'destructive'}
          isLoading={isDeleting}
          onConfirm={
            isDistributed(deleteTarget)
              ? () => setDeleteTarget(null)
              : handleDeleteConfirm
          }
        />
      )}
    </>
  );
}
