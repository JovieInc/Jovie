'use client';

import { useRouter } from 'next/navigation';
import {
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import {
  DrawerButton,
  DrawerLoadingSkeleton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { PageShell } from '@/components/organisms/PageShell';
import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { useAppFlag } from '@/lib/flags/client';
import { QueryErrorBoundary, usePlanGate } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  type AppleMusicArtistSelection,
  connectSelectedAppleMusicArtist,
} from './apple-music-connection';
import { useImportPolling } from './hooks/useImportPolling';
import { useReleaseTablePreferences } from './hooks/useReleaseTablePreferences';
import { NewReleaseHeaderAction } from './NewReleaseHeaderAction';
import { ReleaseStateBanners } from './ReleaseStateBanners';
import { ReleaseTable } from './ReleaseTable';
import {
  DEFAULT_RELEASE_FILTERS,
  type ReleaseFilters,
  ReleaseTableSubheader,
  type ReleaseView,
} from './ReleaseTableSubheader';
import { ReleaseWorkflowOverlays } from './ReleaseWorkflowOverlays';
import {
  restoreReleaseArtwork,
  uploadReleaseArtwork,
} from './release-artwork-actions';
import { useReleaseDeletion } from './release-deletion';
import {
  AddReleaseSidebar,
  ReleaseSidebar,
  ReleasesEmptyState,
  TrackSidebar,
} from './release-lazy-components';
import { usePostCreateReleasePlan } from './release-plan-generation';
import { computeSmartLinkGating } from './smart-link-gating';
import type { ReleaseProviderMatrixProps } from './types';
import { useReleaseProviderMatrix } from './useReleaseProviderMatrix';
import {
  RELEASE_DETAIL_PANEL_WIDTH,
  useReleaseRightPanelTableMeta,
} from './useReleaseRightPanelTableMeta';
import { filterReleases } from './utils/filterReleases';

export const ReleaseProviderMatrix = memo(function ReleaseProviderMatrix({
  releases,
  providerConfig,
  primaryProviders,
  spotifyConnected = false,
  spotifyArtistName = null,
  appleMusicConnected = false,
  appleMusicArtistName = null,
  allowArtworkDownloads = false,
  initialImporting = false,
  initialTotalCount = 0,
  experienceAdapter,
}: ReleaseProviderMatrixProps) {
  const experienceMode = experienceAdapter?.mode ?? 'live';
  const [isConnected, setIsConnected] = useState(spotifyConnected);
  const [artistName, setArtistName] = useState(spotifyArtistName);
  const [isImporting, setIsImporting] = useState(initialImporting);
  const [spotifySearchOpen, setSpotifySearchOpen] = useState(false);

  // Add Release sidebar state
  const [addReleaseOpen, setAddReleaseOpen] = useState(false);

  // Apple Music connection state
  const [isAmConnected, setIsAmConnected] = useState(appleMusicConnected);

  const [amPaletteOpen, setAmPaletteOpen] = useState(false);
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
    captureContext: 'release-provider-matrix',
  });
  const albumArtFlagEnabled = useCodeFlag('ALBUM_ART_GENERATION');
  const designV1ReleasesEnabled = useAppFlag('DESIGN_V1');

  const {
    rows,
    setRows,
    editingRelease,
    isSaving,
    isSyncing,
    handleReleaseCreated,
    updateRow,
    handleReleaseArtworkUploaded,
    openEditor,
    closeEditor,
    handleCopy,
    handleSync,
    handleRefreshRelease,
    refreshingReleaseId,
    flashedReleaseId,
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
  } = useReleaseProviderMatrix({ releases, providerConfig, primaryProviders });
  const copyHandler = experienceAdapter?.onCopy ?? handleCopy;
  const {
    deleteTarget,
    isDeleting,
    requestReleaseDelete: handleDeleteRequest,
    closeDeleteDialog,
    confirmReleaseDelete: handleDeleteConfirm,
  } = useReleaseDeletion({ rows, setRows });

  const [editingTrack, setEditingTrack] = useState<TrackSidebarData | null>(
    null
  );

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
    [rows, openEditor]
  );

  // Table display preferences (column visibility, tracks toggle)
  const {
    columnVisibility,
    rowHeight,
    groupByYear,
    showTracks,
    onShowTracksChange,
  } = useReleaseTablePreferences();

  // Derive releaseView from persisted showTracks preference
  const releaseView: ReleaseView = showTracks ? 'tracks' : 'releases';
  const setReleaseView = useCallback(
    (view: ReleaseView) => onShowTracksChange(view === 'tracks'),
    [onShowTracksChange]
  );

  // Filter state
  const [filters, setFilters] = useState<ReleaseFilters>(
    DEFAULT_RELEASE_FILTERS
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Deduplicate rows by ID before filtering (prevents inflated counts and double highlights)
  const dedupedRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter(r => {
      if (seen.has(r.id)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[ReleaseTable] duplicate release id: ${r.id}`);
        }
        return false;
      }
      seen.add(r.id);
      return true;
    });
  }, [rows]);

  // Apply filters and search to deduped rows
  const filteredRows = useMemo(() => {
    return filterReleases(dedupedRows, filters, deferredSearchQuery);
  }, [dedupedRows, filters, deferredSearchQuery]);

  // Smart link gating
  const planGate = usePlanGate();
  const releasePlanEntitlementOverride =
    experienceAdapter?.entitlements?.canGenerateReleasePlans;
  const {
    smartLinksLimit,
    isPro,
    canCreateManualReleases,
    canGenerateAlbumArt,
    canGenerateReleasePlans,
    canEditSmartLinks,
    canAccessFutureReleases,
  } = {
    ...planGate,
    ...experienceAdapter?.entitlements,
  };
  const isReleasePlanGateLoading =
    (planGate.isLoading || planGate.isError) &&
    releasePlanEntitlementOverride === undefined;

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

  const showGenerateAlbumArtAction =
    albumArtFlagEnabled && Boolean(canGenerateAlbumArt);

  // Partition releases into released vs unreleased, and compute lock state
  const { unlockedIds, lockReasons, releasedCount, unreleasedCount } = useMemo(
    () =>
      computeSmartLinkGating(rows, smartLinksLimit, canAccessFutureReleases),
    [rows, smartLinksLimit, canAccessFutureReleases]
  );

  const isSmartLinkLocked = useCallback(
    (releaseId: string) => {
      if (!unlockedIds) return false; // unlimited plan
      return !unlockedIds.has(releaseId);
    },
    [unlockedIds]
  );

  const getSmartLinkLockReason = useCallback(
    (releaseId: string): 'scheduled' | 'cap' | null => {
      return lockReasons.get(releaseId) ?? null;
    },
    [lockReasons]
  );

  // Empty selection for subheader export (simplified - no bulk selection)
  const selectedIds = useMemo(() => new Set<string>(), []);

  const handleArtistConnected = useCallback(
    (newReleases: ReleaseViewModel[], newArtistName: string) => {
      setIsConnected(true);
      setArtistName(newArtistName);
      // Only clear importing if releases were returned (non-fire-and-forget)
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

  // Polling: update rows as releases are ingested in the background
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
    enabled: isImporting && experienceMode !== 'demo',
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

  const _isAmSyncing = false;

  const handleNewRelease = useCallback(() => {
    if (experienceAdapter?.onCreateRelease) {
      experienceAdapter.onCreateRelease();
      return;
    }
    closeEditor();
    closeTrackDrawer();
    setAddReleaseOpen(true);
  }, [experienceAdapter, closeEditor, closeTrackDrawer]);

  const handleAddReleaseCreated = useCallback(
    (createdRelease: ReleaseViewModel) => {
      handleReleaseCreated(createdRelease, { openEditor: false });
      setAddReleaseOpen(false);
      closeEditor();
      setEditingTrack(null);
      openPostCreatePlanModal(createdRelease);
    },
    [closeEditor, handleReleaseCreated, openPostCreatePlanModal]
  );

  // Wrap openEditor to clear add-release state (prevents zombie drawer resurrection)
  const handleOpenEditor = useCallback(
    (release: ReleaseViewModel) => {
      setAddReleaseOpen(false);
      openEditor(release);
    },
    [openEditor]
  );

  const closeAddRelease = useCallback(() => setAddReleaseOpen(false), []);

  const handleArtworkUpload = uploadReleaseArtwork;
  const handleArtworkRevert = restoreReleaseArtwork;

  // Handle release changes from the sidebar (e.g., after artwork upload)
  const handleReleaseChange = useCallback(
    (updated: ReleaseViewModel) => {
      updateRow(updated);
    },
    [updateRow]
  );

  // Show import progress banner when actively importing
  const showImportProgress = isImporting;
  // Show empty state when not connected and no releases
  const showEmptyState = !isConnected && !isImporting && rows.length === 0;
  // Show releases table when we have releases
  const showReleasesTable = rows.length > 0;

  const isReleaseSidebarOpen = Boolean(editingRelease);
  const isTrackSidebarOpen = Boolean(editingTrack);
  const isSidebarOpen =
    isReleaseSidebarOpen || isTrackSidebarOpen || addReleaseOpen;

  useReleaseRightPanelTableMeta({
    rows,
    isSidebarOpen,
    editingRelease,
    editingTrack,
    closeEditor,
    closeTrackDrawer,
    openEditor,
  });

  const { setHeaderActions } = useSetHeaderActions();

  const syncAction = experienceAdapter?.onSync ?? handleSync;

  const headerActions = useMemo(
    () => (
      <NewReleaseHeaderAction
        canCreateManualReleases={canCreateManualReleases}
        isSyncing={isSyncing}
        onSyncSpotify={syncAction}
        onCreateManual={handleNewRelease}
      />
    ),
    [canCreateManualReleases, handleNewRelease, isSyncing, syncAction]
  );

  useEffect(() => {
    setHeaderActions(headerActions);

    return () => {
      setHeaderActions(null);
    };
  }, [headerActions, setHeaderActions]);

  const releaseSidebarHandlers = useMemo(
    () => ({
      refresh: editingRelease
        ? () =>
            (experienceAdapter?.onRefreshRelease ?? handleRefreshRelease)(
              editingRelease.id
            )
        : undefined,
      rescan: editingRelease
        ? () =>
            (experienceAdapter?.onRescanIsrc ?? handleRescanIsrc)(
              editingRelease.id
            )
        : undefined,
      artworkRevert: experienceAdapter?.onArtworkRevert
        ? (releaseId: string) =>
            experienceAdapter.onArtworkRevert?.(
              releaseId,
              editingRelease ?? null
            ) ?? Promise.resolve(editingRelease?.artworkUrl ?? '')
        : handleArtworkRevert,
      formatLyrics: experienceAdapter?.onFormatLyrics
        ? (releaseId: string, lyrics: string) =>
            experienceAdapter.onFormatLyrics?.(releaseId, lyrics) ??
            Promise.resolve([])
        : handleFormatLyrics,
    }),
    [
      editingRelease,
      experienceAdapter,
      handleArtworkRevert,
      handleFormatLyrics,
      handleRefreshRelease,
      handleRescanIsrc,
    ]
  );

  // Register right panel with AuthShell - supports both release and track drawers
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
      // Add-release form drawer (lowest priority — track/release sidebars take precedence)
      if (
        addReleaseOpen &&
        experienceMode === 'live' &&
        canCreateManualReleases
      ) {
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

    const selectedSidebarData =
      experienceAdapter?.sidebarDataByReleaseId?.[editingRelease?.id ?? ''];

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
        <ReleaseSidebar
          release={editingRelease}
          mode='admin'
          isOpen={isReleaseSidebarOpen}
          width={RELEASE_DETAIL_PANEL_WIDTH}
          providerConfig={providerConfig}
          artistName={artistName}
          onArtistClick={name => setSearchQuery(name)}
          canGenerateAlbumArt={showGenerateAlbumArtAction}
          onGenerateAlbumArt={handleGenerateAlbumArt}
          onClose={closeEditor}
          onRefresh={releaseSidebarHandlers.refresh}
          isRefreshing={refreshingReleaseId === editingRelease?.id}
          onAddDspLink={experienceAdapter?.onAddDspLink ?? handleAddUrl}
          onRescanIsrc={releaseSidebarHandlers.rescan}
          isRescanningIsrc={isRescanningIsrc}
          onArtworkUpload={
            experienceAdapter?.onArtworkUpload ?? handleArtworkUpload
          }
          onArtworkRevert={releaseSidebarHandlers.artworkRevert}
          onReleaseChange={handleReleaseChange}
          onSaveMetadata={
            experienceAdapter?.onSaveMetadata ?? handleSaveMetadata
          }
          onSavePrimaryIsrc={
            experienceAdapter?.onSavePrimaryIsrc ?? handleSavePrimaryIsrc
          }
          onSaveLyrics={experienceAdapter?.onSaveLyrics ?? handleSaveLyrics}
          onSaveTargetPlaylists={
            experienceAdapter?.onSaveTargetPlaylists ??
            handleSaveTargetPlaylists
          }
          onFormatLyrics={releaseSidebarHandlers.formatLyrics}
          isLyricsSaving={isLyricsSaving}
          isSaving={isSaving}
          allowDownloads={allowArtworkDownloads}
          onToggleArtworkDownloads={experienceAdapter?.onToggleArtworkDownloads}
          readOnly={experienceMode === 'demo' ? false : !canEditSmartLinks}
          analyticsOverride={selectedSidebarData?.analytics ?? null}
          tracksOverride={selectedSidebarData?.tracks}
          showCredits={experienceMode === 'live'}
          designV1={designV1ReleasesEnabled}
          onCanvasStatusUpdate={
            experienceAdapter?.onCanvasStatusUpdate ?? handleCanvasStatusUpdate
          }
        />
      </Suspense>
    );
  }, [
    isReleaseSidebarOpen,
    isTrackSidebarOpen,
    addReleaseOpen,
    editingRelease,
    editingTrack,
    providerConfig,
    artistName,
    showGenerateAlbumArtAction,
    handleGenerateAlbumArt,
    closeEditor,
    closeTrackDrawer,
    experienceAdapter,
    experienceMode,
    canCreateManualReleases,
    closeAddRelease,
    handleAddReleaseCreated,
    handleReleaseArtworkUploaded,
    handleBackToReleaseFromTrack,
    refreshingReleaseId,
    handleAddUrl,
    isRescanningIsrc,
    handleArtworkUpload,
    handleReleaseChange,
    handleSaveMetadata,
    handleSavePrimaryIsrc,
    handleSaveLyrics,
    handleSaveTargetPlaylists,
    isLyricsSaving,
    isSaving,
    allowArtworkDownloads,
    canEditSmartLinks,
    handleCanvasStatusUpdate,
    releaseSidebarHandlers,
    designV1ReleasesEnabled,
  ]);

  useRegisterRightPanel(sidebarPanel);

  return (
    <>
      <div
        className='flex h-full min-h-0 min-w-0 flex-col'
        data-testid='releases-matrix'
        data-design-v1-releases={designV1ReleasesEnabled ? 'true' : undefined}
      >
        <h1 className='sr-only'>Releases</h1>

        <ReleaseStateBanners
          rows={rows}
          showImportProgress={showImportProgress}
          showReleasesTable={showReleasesTable}
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
        {showEmptyState && (
          <PageShell className='mt-2.5' data-testid='release-table-shell'>
            <Suspense fallback={null}>
              <ReleasesEmptyState
                onConnectSpotify={() => setSpotifySearchOpen(true)}
              />
            </Suspense>
          </PageShell>
        )}

        {/* Table — fills edge-to-edge within the app shell */}
        {showReleasesTable && (
          <QueryErrorBoundary>
            <PageShell
              className='mt-2.5'
              data-testid='release-table-shell'
              toolbar={
                <ReleaseTableSubheader
                  releases={filteredRows}
                  allReleases={dedupedRows}
                  selectedIds={selectedIds}
                  filters={filters}
                  onFiltersChange={setFilters}
                  releaseView={releaseView}
                  onReleaseViewChange={setReleaseView}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                  onCreateRelease={handleNewRelease}
                  canCreateManualReleases={canCreateManualReleases}
                />
              }
            >
              <ReleaseTable
                releases={filteredRows}
                providerConfig={providerConfig}
                artistName={artistName}
                onCopy={copyHandler}
                onEdit={handleOpenEditor}
                onDelete={handleDeleteRequest}
                canGenerateAlbumArt={showGenerateAlbumArtAction}
                onGenerateAlbumArt={handleGenerateAlbumArt}
                columnVisibility={columnVisibility}
                rowHeight={designV1ReleasesEnabled ? 46 : rowHeight}
                showTracks={showTracks}
                groupByYear={groupByYear}
                selectedReleaseId={editingRelease?.id}
                selectedTrackId={editingTrack?.id}
                designV1={designV1ReleasesEnabled}
                refreshingReleaseId={refreshingReleaseId}
                flashedReleaseId={flashedReleaseId}
                isSmartLinkLocked={isSmartLinkLocked}
                getSmartLinkLockReason={getSmartLinkLockReason}
                onTrackClick={openTrackDrawer}
              />
            </PageShell>
          </QueryErrorBoundary>
        )}

        {/* Show "No releases" state when connected but no releases and not importing */}
        {isConnected && rows.length === 0 && !isImporting && (
          <PageShell className='mt-2.5' data-testid='release-table-shell'>
            <DrawerSurfaceCard
              variant='card'
              className='flex min-h-[212px] flex-col items-center justify-center px-5 py-9 text-center'
              testId='releases-empty-state-connected'
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
                  onClick={experienceAdapter?.onSync ?? handleSync}
                  className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                  data-testid='sync-spotify-empty-state'
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
                    onClick={handleNewRelease}
                    className='h-7 rounded-lg px-2.5 text-2xs inline-flex items-center gap-2'
                    data-testid='create-release-empty-state'
                  >
                    <Icon name='Plus' className='h-4 w-4' aria-hidden='true' />
                    Create Release
                  </DrawerButton>
                )}
              </div>
            </DrawerSurfaceCard>
          </PageShell>
        )}
      </div>

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
});
