'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  DrawerButton,
  DrawerLoadingSkeleton,
} from '@/components/molecules/drawer';
import { PageShell } from '@/components/organisms/PageShell';
import type {
  ReleaseSidebarProps,
  TrackSidebarData,
} from '@/components/organisms/release-sidebar';
import {
  convertContextMenuItems,
  useAmbientListSelection,
} from '@/components/organisms/table';
import type {
  FilterField,
  FilterPill,
} from '@/components/shell/pill-search.types';
import {
  useRegisterHeaderActions,
  useRegisterHeaderSearch,
} from '@/contexts/HeaderActionsContext';
import { buildReleaseActions } from '@/features/dashboard/organisms/releases/release-actions';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { useAppFlag } from '@/lib/flags/client';
import { usePlanGate } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  type AppleMusicArtistSelection,
  connectSelectedAppleMusicArtist,
} from '../apple-music-connection';
import { useImportPolling } from '../hooks/useImportPolling';
import { NewReleaseHeaderAction } from '../NewReleaseHeaderAction';
import { ReleaseStateBanners } from '../ReleaseStateBanners';
import { ReleaseWorkflowOverlays } from '../ReleaseWorkflowOverlays';
import {
  restoreReleaseArtwork,
  uploadReleaseArtwork,
} from '../release-artwork-actions';
import { useReleaseDeletion } from '../release-deletion';
import {
  AddReleaseSidebar,
  ReleaseSidebar,
  TrackSidebar,
} from '../release-lazy-components';
import { usePostCreateReleasePlan } from '../release-plan-generation';
import {
  computeSmartLinkGating,
  type SmartLinkLockReason,
} from '../smart-link-gating';
import { useReleaseProviderMatrix } from '../useReleaseProviderMatrix';
import {
  RELEASE_DETAIL_PANEL_WIDTH,
  useReleaseRightPanelTableMeta,
} from '../useReleaseRightPanelTableMeta';
import { releaseStatusToShell } from './release-adapters';
import { ShellReleaseRow } from './ShellReleaseRow';

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
        <div
          className='max-w-sm'
          data-testid='shell-releases-empty-state-connected'
        >
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
        </div>
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
              className='mt-2 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors duration-subtle ease-subtle'
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
 * while keeping the shell-style row list, shell-owned filter header, and production
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
  const {
    postCreateRelease,
    isPostCreatePlanModalOpen,
    isGeneratingReleasePlan,
    openPostCreatePlanModal,
    closePostCreatePlanModal,
    handleGenerateReleasePlan,
  } = usePostCreateReleasePlan({
    router,
    captureContext: 'shell-releases-view',
  });
  const albumArtFlagEnabled = useAppFlag('ALBUM_ART_GENERATION');

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
  const {
    deleteTarget,
    isDeleting,
    requestReleaseDelete: handleDeleteRequest,
    closeDeleteDialog,
    confirmReleaseDelete: handleDeleteConfirm,
  } = useReleaseDeletion({ rows, setRows });

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
    async (artist: AppleMusicArtistSelection) => {
      await connectSelectedAppleMusicArtist(artist, () =>
        setIsAmConnected(true)
      );
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
      openPostCreatePlanModal(createdRelease);
    },
    [closeEditor, handleReleaseCreated, openPostCreatePlanModal]
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

  // ── Header actions: NewReleaseHeaderAction + secondary filter control ──

  const selectedReleaseId = editingRelease?.id ?? null;

  const handleClearFilters = useCallback(() => {
    setPills([]);
  }, []);

  const headerSearchAdapter = useMemo(
    () => ({
      key: 'shell-releases',
      pills,
      onPillsChange: setPills,
      artistOptions,
      titleOptions,
      albumOptions,
      totalCount: rows.length,
      visibleCount: visibleReleases.length,
      triggerLabel: 'Filter',
      ariaLabel: 'Filter releases',
      placeholder: 'Filter releases',
      allowedFields: ['artist', 'title', 'album', 'status', 'has'] as const,
    }),
    [
      albumOptions,
      artistOptions,
      pills,
      rows.length,
      titleOptions,
      visibleReleases.length,
    ]
  );

  useRegisterHeaderSearch(headerSearchAdapter);

  const headerActions = useMemo(() => {
    return (
      <div className='flex items-center gap-2'>
        <NewReleaseHeaderAction
          canCreateManualReleases={canCreateManualReleases}
          isSyncing={isSyncing}
          onSyncSpotify={handleSync}
          onCreateManual={handleNewRelease}
        />
      </div>
    );
  }, [canCreateManualReleases, handleNewRelease, handleSync, isSyncing]);

  useRegisterHeaderActions(headerActions);

  useReleaseRightPanelTableMeta({
    rows,
    isSidebarOpen,
    editingRelease,
    editingTrack,
    closeEditor,
    closeTrackDrawer,
    openEditor,
  });

  // ── Conditional state surfaces ──

  const showImportProgress = isImporting;
  const showEmptyState = !isConnected && !isImporting && rows.length === 0;
  const showConnectedEmptyState =
    isConnected && rows.length === 0 && !isImporting;

  return (
    <>
      <PageShell
        aria-label='Releases'
        frame='content-container'
        contentPadding='none'
        className='h-full focus:outline-none'
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
      </PageShell>

      <ReleaseWorkflowOverlays
        amPaletteOpen={amPaletteOpen}
        setAmPaletteOpen={setAmPaletteOpen}
        spotifySearchOpen={spotifySearchOpen}
        setSpotifySearchOpen={setSpotifySearchOpen}
        onAppleMusicConnect={handleAppleMusicConnect}
        onSpotifyConnected={handleArtistConnected}
        onSpotifyImportStart={handleImportStart}
        postCreateRelease={postCreateRelease}
        isPostCreatePlanModalOpen={isPostCreatePlanModalOpen}
        isReleasePlanGateLoading={isReleasePlanGateLoading}
        canGenerateReleasePlans={canGenerateReleasePlans}
        isGeneratingReleasePlan={isGeneratingReleasePlan}
        closePostCreatePlanModal={closePostCreatePlanModal}
        onGenerateReleasePlan={handleGenerateReleasePlan}
        deleteTarget={deleteTarget}
        isDeleting={isDeleting}
        closeDeleteDialog={closeDeleteDialog}
        onDeleteConfirm={handleDeleteConfirm}
      />
    </>
  );
}
