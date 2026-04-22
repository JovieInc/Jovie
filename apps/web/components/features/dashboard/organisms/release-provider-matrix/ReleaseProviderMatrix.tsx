'use client';

import { useRouter } from 'next/navigation';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import {
  connectAppleMusicArtist,
  deleteRelease,
  revertReleaseArtwork,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { Icon } from '@/components/atoms/Icon';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import {
  DrawerButton,
  DrawerLoadingSkeleton,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { DialogLoadingSkeleton } from '@/components/organisms/DialogLoadingSkeleton';
import { PageShell } from '@/components/organisms/PageShell';
import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { openChatWithPrompt } from '@/lib/chat/open-chat-with-prompt';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';
import { useCodeFlag } from '@/lib/feature-flags/client';
import { QueryErrorBoundary, usePlanGate } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useImportPolling } from './hooks/useImportPolling';
import { useReleaseTablePreferences } from './hooks/useReleaseTablePreferences';
import { NewReleaseHeaderAction } from './NewReleaseHeaderAction';
import { ReleaseTable } from './ReleaseTable';
import {
  DEFAULT_RELEASE_FILTERS,
  type ReleaseFilters,
  ReleaseTableSubheader,
  type ReleaseView,
} from './ReleaseTableSubheader';
import type { ReleaseProviderMatrixProps } from './types';
import { useReleaseProviderMatrix } from './useReleaseProviderMatrix';
import { filterReleases } from './utils/filterReleases';

// Lazy load AddReleaseSidebar
const AddReleaseSidebar = lazy(() =>
  import('./AddReleaseSidebar').then(m => ({
    default: m.AddReleaseSidebar,
  }))
);

// Lazy load ReleaseSidebar - reduces initial bundle by ~30-50KB
const ReleaseSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.ReleaseSidebar,
  }))
);

// Lazy load TrackSidebar
const TrackSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.TrackSidebar,
  }))
);

// Lazy load SpotifyConnectDialog - only shown on user interaction
const SpotifyConnectDialog = lazy(() =>
  import('./SpotifyConnectDialog').then(m => ({
    default: m.SpotifyConnectDialog,
  }))
);

// Lazy load Apple Music search palette - only used from the sync banner flow.
const ArtistSearchCommandPalette = lazy(() =>
  import('@/components/organisms/artist-search-palette').then(m => ({
    default: m.ArtistSearchCommandPalette,
  }))
);

const ImportProgressBanner = lazy(() =>
  import('./ImportProgressBanner').then(m => ({
    default: m.ImportProgressBanner,
  }))
);

const AppleMusicSyncBanner = lazy(() =>
  import('./AppleMusicSyncBanner').then(m => ({
    default: m.AppleMusicSyncBanner,
  }))
);

const ReleasesEmptyState = lazy(() =>
  import('./ReleasesEmptyState').then(m => ({
    default: m.ReleasesEmptyState,
  }))
);

const SmartLinkGateBanner = lazy(() =>
  import('./SmartLinkGateBanner').then(m => ({
    default: m.SmartLinkGateBanner,
  }))
);

const ReleasePlanPromptDialog = lazy(() =>
  import('./ReleasePlanPromptDialog').then(m => ({
    default: m.ReleasePlanPromptDialog,
  }))
);

const RELEASE_DETAIL_PANEL_WIDTH = 388;

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
  const [postCreateRelease, setPostCreateRelease] =
    useState<ReleaseViewModel | null>(null);
  const [isPostCreatePlanModalOpen, setIsPostCreatePlanModalOpen] =
    useState(false);
  const [isGeneratingReleasePlan, setIsGeneratingReleasePlan] = useState(false);
  const router = useRouter();
  const albumArtFlagEnabled = useCodeFlag('ALBUM_ART_GENERATION');

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

  // Delete state and handlers
  const [deleteTarget, setDeleteTarget] = useState<ReleaseViewModel | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
    onGroupByYearChange,
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

  /** Soft cap: show a "request higher limit" banner (not a hard lock) */
  const SMART_LINK_SOFT_CAP = 100;

  // Partition releases into released vs unreleased, and compute lock state
  const { unlockedIds, lockReasons, releasedCount, unreleasedCount } =
    useMemo(() => {
      const now = Date.now();
      const released: typeof rows = [];
      const unreleased: typeof rows = [];
      const reasons = new Map<string, 'scheduled' | 'cap'>();

      for (const r of rows) {
        const releaseTime = r.releaseDate
          ? new Date(r.releaseDate).getTime()
          : 0;
        if (releaseTime > now) {
          unreleased.push(r);
          // Mark as scheduled if the creator can't access future release pages
          if (!canAccessFutureReleases) {
            reasons.set(r.id, 'scheduled');
          }
        } else {
          released.push(r);
        }
      }

      if (!smartLinksLimit) {
        // null = unlimited — no cap-based locks
        return {
          unlockedIds: canAccessFutureReleases
            ? null
            : new Set(released.map(r => r.id)),
          lockReasons: reasons,
          releasedCount: released.length,
          unreleasedCount: unreleased.length,
        };
      }

      // Apply cap-based locks (oldest first when over cap)
      const sorted = [...released].sort((a, b) => {
        const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
        const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
        return dateA - dateB;
      });
      const allowed = sorted.slice(0, smartLinksLimit);
      const ids = new Set(allowed.map(r => r.id));

      for (const r of sorted.slice(smartLinksLimit)) {
        reasons.set(r.id, 'cap');
      }

      return {
        unlockedIds: ids,
        lockReasons: reasons,
        releasedCount: released.length,
        unreleasedCount: unreleased.length,
      };
    }, [rows, smartLinksLimit, canAccessFutureReleases]);

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

  const handleGenerateReleasePlan = useCallback(async () => {
    if (!postCreateRelease || isGeneratingReleasePlan) {
      return;
    }

    setIsGeneratingReleasePlan(true);
    try {
      await instantiateReleaseTasks(postCreateRelease.id);
      const releaseTasksPath = APP_ROUTES.DASHBOARD_RELEASE_TASKS.replace(
        '[releaseId]',
        postCreateRelease.id
      );
      setIsPostCreatePlanModalOpen(false);
      setPostCreateRelease(null);
      router.push(releaseTasksPath);
    } catch (error) {
      captureError('Failed to generate release plan', error, {
        context: 'release-provider-matrix',
        releaseId: postCreateRelease.id,
        action: 'generate-release-plan',
      });
      toast.error('Failed to generate the release plan. Try again.');
    } finally {
      setIsGeneratingReleasePlan(false);
    }
  }, [isGeneratingReleasePlan, postCreateRelease, router]);

  // Wrap openEditor to clear add-release state (prevents zombie drawer resurrection)
  const handleOpenEditor = useCallback(
    (release: ReleaseViewModel) => {
      setAddReleaseOpen(false);
      openEditor(release);
    },
    [openEditor]
  );

  const closeAddRelease = useCallback(() => setAddReleaseOpen(false), []);

  // Artwork upload handler - calls the artwork upload API endpoint
  const handleArtworkUpload = useCallback(
    async (file: File, release: ReleaseViewModel): Promise<string> => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `/api/images/artwork/upload?releaseId=${encodeURIComponent(release.id)}`,
        { method: 'POST', body: formData }
      );

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: 'Upload failed' }));
        throw new Error(error.message ?? 'Failed to upload artwork');
      }

      const result = await response.json();
      return result.artworkUrl;
    },
    []
  );

  // Artwork revert handler - reverts to original DSP-ingested artwork
  const handleArtworkRevert = useCallback(
    async (releaseId: string): Promise<string> => {
      const result = await revertReleaseArtwork(releaseId);
      return result.artworkUrl;
    },
    []
  );

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

  // Connect to tableMeta for drawer toggle button
  const { setTableMeta } = useTableMeta();

  // Use ref to avoid infinite loop - rows array reference changes each render
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    // Toggle function: close if open, open first release if closed
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setTableMeta is a stable context setter
  }, [
    editingRelease,
    editingTrack,
    rows.length,
    closeEditor,
    closeTrackDrawer,
    openEditor,
    isSidebarOpen,
  ]);

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
  ]);

  useRegisterRightPanel(sidebarPanel);

  return (
    <>
      <div
        className='flex h-full min-h-0 min-w-0 flex-col'
        data-testid='releases-matrix'
      >
        <h1 className='sr-only'>Releases</h1>

        {/* Banners — inset from shell edge */}
        {showImportProgress && (
          <div className='mx-3 lg:mx-4 mt-3'>
            <Suspense fallback={null}>
              <ImportProgressBanner
                artistName={artistName}
                importedCount={importedCount}
                totalCount={totalCount}
                visible={showImportProgress}
              />
            </Suspense>
          </div>
        )}
        {showReleasesTable &&
          rows[0]?.profileId &&
          !isAmConnected &&
          !isImporting && (
            <Suspense fallback={null}>
              <AppleMusicSyncBanner
                profileId={rows[0].profileId}
                spotifyConnected={isConnected}
                releases={rows}
                onMatchStatusChange={handleMatchStatusChange}
                className='mx-3 lg:mx-4 mt-3'
              />
            </Suspense>
          )}
        {showEmptyState && (
          <PageShell className='mt-2.5' data-testid='release-table-shell'>
            <Suspense fallback={null}>
              <ReleasesEmptyState
                onConnectSpotify={() => setSpotifySearchOpen(true)}
              />
            </Suspense>
          </PageShell>
        )}

        {/* Soft-cap banner: request higher limit when over 100 smart links */}
        {showReleasesTable && !isPro && releasedCount > SMART_LINK_SOFT_CAP && (
          <Suspense fallback={null}>
            <SmartLinkGateBanner
              mode='soft-cap'
              releasedCount={releasedCount}
              softCap={SMART_LINK_SOFT_CAP}
              className='mx-3 lg:mx-4 mt-3'
            />
          </Suspense>
        )}

        {/* Pre-release upsell for free users with unreleased music */}
        {showReleasesTable &&
          !isPro &&
          !canAccessFutureReleases &&
          unreleasedCount > 0 && (
            <Suspense fallback={null}>
              <SmartLinkGateBanner
                mode='unreleased'
                unreleasedCount={unreleasedCount}
                className='mx-3 lg:mx-4 mt-3'
              />
            </Suspense>
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
                  groupByYear={groupByYear}
                  onGroupByYearChange={onGroupByYearChange}
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
                rowHeight={rowHeight}
                showTracks={showTracks}
                groupByYear={groupByYear}
                selectedReleaseId={editingRelease?.id}
                selectedTrackId={editingTrack?.id}
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
              <h3 className='text-[13px] font-[510] text-primary-token'>
                No releases yet
              </h3>
              <p className='mt-0.5 max-w-sm text-[12px] leading-[17px] text-secondary-token'>
                {canCreateManualReleases
                  ? 'Sync from Spotify or create one manually to start generating smart links.'
                  : 'Sync from Spotify to start generating smart links.'}
              </p>
              <div className='mt-3 flex flex-wrap items-center justify-center gap-2.5'>
                <DrawerButton
                  tone='primary'
                  disabled={isSyncing}
                  onClick={experienceAdapter?.onSync ?? handleSync}
                  className='h-7 rounded-[8px] px-2.5 text-[11px] inline-flex items-center gap-2'
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
                    className='h-7 rounded-[8px] px-2.5 text-[11px] inline-flex items-center gap-2'
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
          <ReleasePlanPromptDialog
            open
            releaseTitle={postCreateRelease.title}
            isGateLoading={isReleasePlanGateLoading}
            canGenerateReleasePlans={canGenerateReleasePlans}
            isGeneratingReleasePlan={isGeneratingReleasePlan}
            onClose={closePostCreatePlanModal}
            onGenerateReleasePlan={handleGenerateReleasePlan}
          />
        ) : null}
      </Suspense>

      {/* Delete confirmation / blocking dialog */}
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
});
