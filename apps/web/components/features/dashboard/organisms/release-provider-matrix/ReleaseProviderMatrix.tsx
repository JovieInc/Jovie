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
import {
  connectAppleMusicArtist,
  deleteRelease,
  revertReleaseArtwork,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { instantiateReleaseTasksFromCatalog } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { toast } from '@/components/feedback';
import { ConfirmDialog } from '@/components/molecules/ConfirmDialog';
import { DrawerLoadingSkeleton } from '@/components/molecules/drawer';
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
import { useAppFlag } from '@/lib/flags/client';
import { QueryErrorBoundary, usePlanGate } from '@/lib/queries';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';
import { shouldArchiveOnlyRelease } from '@/lib/releases/release-archive-policy';
import { buildReleasePitchChatPrompt } from '@/lib/services/pitch/targets';
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

const _ImportProgressBanner = lazy(() =>
  import('./ImportProgressBanner').then(m => ({
    default: m.ImportProgressBanner,
  }))
);

const _AppleMusicSyncBanner = lazy(() =>
  import('./AppleMusicSyncBanner').then(m => ({
    default: m.AppleMusicSyncBanner,
  }))
);

const ReleasesEmptyState = lazy(() =>
  import('./ReleasesEmptyState').then(m => ({
    default: m.ReleasesEmptyState,
  }))
);

const _SmartLinkGateBanner = lazy(() =>
  import('./SmartLinkGateBanner').then(m => ({
    default: m.SmartLinkGateBanner,
  }))
);

const _ReleasePlanWizard = lazy(() =>
  import('./ReleasePlanWizard').then(m => ({
    default: m.ReleasePlanWizard,
  }))
);

import {
  ConnectedReleaseEmptyState,
  ReleaseAppleMusicSyncNotice,
  ReleaseImportProgressNotice,
  ReleasePlanDialog,
  ReleaseSmartLinkNotices,
} from './ReleaseProviderMatrixNotices';

const RELEASE_DETAIL_PANEL_WIDTH = 388;
const _SMART_LINK_SOFT_CAP = 100;

type ReleaseLockReason = 'scheduled' | 'cap';
type AppleMusicArtist = {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
};

interface ReleaseLockState {
  readonly unlockedIds: Set<string> | null;
  readonly lockReasons: Map<string, ReleaseLockReason>;
  readonly releasedCount: number;
  readonly unreleasedCount: number;
}

function buildReleaseLockState(
  rows: ReleaseViewModel[],
  smartLinksLimit: number | null,
  canAccessFutureReleases: boolean
): ReleaseLockState {
  const now = Date.now();
  const released: typeof rows = [];
  const unreleased: typeof rows = [];
  const reasons = new Map<string, ReleaseLockReason>();

  for (const r of rows) {
    const releaseTime = r.releaseDate ? new Date(r.releaseDate).getTime() : 0;
    if (releaseTime > now) {
      unreleased.push(r);
      if (!canAccessFutureReleases) {
        reasons.set(r.id, 'scheduled');
      }
    } else {
      released.push(r);
    }
  }

  if (!smartLinksLimit) {
    return {
      unlockedIds: canAccessFutureReleases
        ? null
        : new Set(released.map(r => r.id)),
      lockReasons: reasons,
      releasedCount: released.length,
      unreleasedCount: unreleased.length,
    };
  }

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
}

function isDistributedRelease(release: ReleaseViewModel) {
  // Shared policy: provider-ingested + published → archive-only (JOV-3885).
  return (
    shouldArchiveOnlyRelease(release) ||
    (release.sourceType == null &&
      Boolean(release.primaryIsrc) &&
      Boolean(release.releaseDate) &&
      new Date(release.releaseDate as string) <= new Date())
  );
}

function AppleMusicPaletteDialog({
  open,
  onOpenChange,
  onArtistSelect,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onArtistSelect: (artist: AppleMusicArtist) => Promise<void>;
}) {
  return (
    <Suspense
      fallback={
        open ? (
          <DialogLoadingSkeleton
            open={open}
            onClose={() => onOpenChange(false)}
            size='lg'
            rows={3}
          />
        ) : null
      }
    >
      {open ? (
        <ArtistSearchCommandPalette
          open={open}
          onOpenChange={onOpenChange}
          provider='apple_music'
          onArtistSelect={onArtistSelect}
        />
      ) : null}
    </Suspense>
  );
}

function DeleteReleaseConfirmation({
  target,
  isDeleting,
  onClose,
  onConfirm,
}: {
  readonly target: ReleaseViewModel | null;
  readonly isDeleting: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void | Promise<void>;
}) {
  if (!target) {
    return null;
  }

  const isDistributed = isDistributedRelease(target);
  const title = isDistributed
    ? `Archive "${target.title}"?`
    : `Delete "${target.title}"?`;
  const description = isDistributed
    ? 'This release was ingested from a provider and is already released. It will be archived (hidden from your dashboard and public profile), not permanently deleted.'
    : 'This will permanently remove the release from your dashboard and public profile.';

  return (
    <ConfirmDialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={isDistributed ? 'Archive' : 'Delete'}
      variant={isDistributed ? 'default' : 'destructive'}
      isLoading={isDeleting}
      onConfirm={onConfirm}
    />
  );
}

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
  const albumArtFlagEnabled = useAppFlag('ALBUM_ART_GENERATION');
  const designV1ReleasesEnabled = useAppFlag('DESIGN_V1_RELEASES');

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
    handleFormatLyrics,
    isLyricsSaving,
  } = useReleaseProviderMatrix({ releases, providerConfig, primaryProviders });
  const copyHandler = experienceAdapter?.onCopy ?? handleCopy;

  // Delete state and handlers
  const [deleteTarget, setDeleteTarget] = useState<ReleaseViewModel | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
    const archiveOnly = isDistributedRelease(deleteTarget);
    setIsDeleting(true);
    try {
      const result = await deleteRelease({ releaseId: deleteTarget.id });
      if (result.success) {
        setRows(prev => prev.filter(r => r.id !== deleteTarget.id));
        toast.success(
          archiveOnly || result.mode === 'archive'
            ? `"${deleteTarget.title}" archived.`
            : `"${deleteTarget.title}" deleted.`
        );
      } else {
        toast.error(
          result.message ??
            (archiveOnly
              ? 'Failed to archive release.'
              : 'Failed to delete release.')
        );
      }
    } catch {
      toast.error(
        archiveOnly ? 'Failed to archive release.' : 'Failed to delete release.'
      );
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
  const entitlementOverrides = experienceAdapter?.entitlements;
  const releasePlanEntitlementOverride =
    entitlementOverrides?.canGenerateReleasePlans;
  const smartLinksLimit =
    entitlementOverrides?.smartLinksLimit ?? planGate.smartLinksLimit;
  const isPro = entitlementOverrides?.isPro ?? planGate.isPro;
  const canCreateManualReleases =
    entitlementOverrides?.canCreateManualReleases ??
    planGate.canCreateManualReleases;
  const canGenerateAlbumArt =
    entitlementOverrides?.canGenerateAlbumArt ?? planGate.canGenerateAlbumArt;
  const canGenerateReleasePlans =
    releasePlanEntitlementOverride ?? planGate.canGenerateReleasePlans;
  const canEditSmartLinks =
    entitlementOverrides?.canEditSmartLinks ?? planGate.canEditSmartLinks;
  const canAccessFutureReleases =
    entitlementOverrides?.canAccessFutureReleases ??
    planGate.canAccessFutureReleases;
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

  const handleGeneratePitch = useCallback(
    (release: ReleaseViewModel) => {
      openChatWithPrompt(
        buildReleasePitchChatPrompt({
          releaseId: release.id,
          releaseTitle: release.title,
        }),
        router
      );
    },
    [router]
  );

  const showGenerateAlbumArtAction =
    albumArtFlagEnabled && Boolean(canGenerateAlbumArt);

  // Partition releases into released vs unreleased, and compute lock state
  const { unlockedIds, lockReasons, releasedCount, unreleasedCount } = useMemo(
    () => buildReleaseLockState(rows, smartLinksLimit, canAccessFutureReleases),
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
  const selectedIds = useRef(new Set<string>()).current;

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
    async (artist: AppleMusicArtist) => {
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
          // Fallback: legacy default-template path (used only if the wizard
          // is bypassed).
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
          context: 'release-provider-matrix',
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
  const tableTracksByReleaseId = useMemo(() => {
    if (experienceAdapter?.tracksByReleaseId) {
      return experienceAdapter.tracksByReleaseId;
    }
    if (!experienceAdapter?.sidebarDataByReleaseId) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(experienceAdapter.sidebarDataByReleaseId)
        .filter(([, data]) => data.tracks)
        .map(([releaseId, data]) => [releaseId, data.tracks ?? []])
    );
  }, [experienceAdapter]);

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
          onGeneratePitch={handleGeneratePitch}
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
    handleGeneratePitch,
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
      >
        <h1 className='sr-only'>Releases</h1>

        {/* Banners — inset from shell edge */}
        <ReleaseImportProgressNotice
          visible={showImportProgress}
          artistName={artistName}
          importedCount={importedCount}
          totalCount={totalCount}
        />
        <ReleaseAppleMusicSyncNotice
          showReleasesTable={showReleasesTable}
          profileId={rows[0]?.profileId ?? null}
          isAppleMusicConnected={isAmConnected}
          isImporting={isImporting}
          spotifyConnected={isConnected}
          releases={rows}
          onMatchStatusChange={handleMatchStatusChange}
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

        <ReleaseSmartLinkNotices
          showReleasesTable={showReleasesTable}
          isPro={isPro}
          releasedCount={releasedCount}
          canAccessFutureReleases={canAccessFutureReleases}
          unreleasedCount={unreleasedCount}
        />

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
                onGeneratePitch={handleGeneratePitch}
                columnVisibility={columnVisibility}
                rowHeight={designV1ReleasesEnabled ? 46 : rowHeight}
                showTracks={showTracks}
                groupByYear={groupByYear}
                selectedReleaseId={editingRelease?.id}
                selectedTrackId={editingTrack?.id}
                tracksByReleaseId={tableTracksByReleaseId}
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

        <ConnectedReleaseEmptyState
          visible={isConnected && rows.length === 0 && !isImporting}
          canCreateManualReleases={canCreateManualReleases}
          isSyncing={isSyncing}
          onSync={experienceAdapter?.onSync ?? handleSync}
          onCreateManual={handleNewRelease}
        />
      </div>

      <AppleMusicPaletteDialog
        open={amPaletteOpen}
        onOpenChange={setAmPaletteOpen}
        onArtistSelect={handleAppleMusicConnect}
      />

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

      <ReleasePlanDialog
        open={isPostCreatePlanModalOpen}
        release={postCreateRelease}
        isGateLoading={isReleasePlanGateLoading}
        canGenerateReleasePlans={canGenerateReleasePlans}
        isGeneratingReleasePlan={isGeneratingReleasePlan}
        onClose={closePostCreatePlanModal}
        onSubmit={handleGenerateReleasePlan}
      />

      {/* Delete confirmation / blocking dialog */}
      <DeleteReleaseConfirmation
        target={deleteTarget}
        isDeleting={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
});
