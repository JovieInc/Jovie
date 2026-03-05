'use client';

import { Button } from '@jovie/ui';
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
  rescanAppleMusicLinks,
  revertReleaseArtwork,
} from '@/app/app/(shell)/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { DspConnectionPill } from '@/components/dashboard/atoms/DspConnectionPill';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { usePlanGate } from '@/lib/queries/usePlanGate';
import { cn } from '@/lib/utils';
import { AppleMusicSyncBanner } from './AppleMusicSyncBanner';
import { useImportPolling } from './hooks/useImportPolling';
import { useReleaseTablePreferences } from './hooks/useReleaseTablePreferences';
import { ImportProgressBanner } from './ImportProgressBanner';
import { ReleasesEmptyState } from './ReleasesEmptyState';
import { ReleaseTable } from './ReleaseTable';
import {
  DEFAULT_RELEASE_FILTERS,
  type ReleaseFilters,
  ReleaseTableSubheader,
  type ReleaseView,
} from './ReleaseTableSubheader';
import { SmartLinkGateBanner } from './SmartLinkGateBanner';
import type { ReleaseProviderMatrixProps } from './types';
import { useReleaseProviderMatrix } from './useReleaseProviderMatrix';
import { filterReleases } from './utils/filterReleases';

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
}: ReleaseProviderMatrixProps) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(spotifyConnected);
  const [artistName, setArtistName] = useState(spotifyArtistName);
  const [isImporting, setIsImporting] = useState(initialImporting);
  const [spotifySearchOpen, setSpotifySearchOpen] = useState(false);

  // Apple Music connection state
  const [isAmConnected, setIsAmConnected] = useState(appleMusicConnected);
  const [amArtistName, setAmArtistName] = useState(appleMusicArtistName);
  const [amPaletteOpen, setAmPaletteOpen] = useState(false);

  const {
    rows,
    setRows,
    editingRelease,
    isSaving,
    isSyncing,
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
    handleSaveLyrics,
    handleFormatLyrics,
    isLyricsSaving,
  } = useReleaseProviderMatrix({ releases, providerConfig, primaryProviders });

  const [editingTrack, setEditingTrack] = useState<TrackSidebarData | null>(
    null
  );

  const openTrackDrawer = useCallback(
    (trackData: TrackSidebarData) => {
      closeEditor();
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

  const handleTrackClickFromRelease = useCallback(
    (track: {
      id: string;
      title: string;
      slug: string;
      smartLinkPath: string;
      trackNumber: number;
      discNumber: number;
      durationMs: number | null;
      isrc: string | null;
      isExplicit: boolean;
      providers: Array<{ key: string; label: string; url: string }>;
      releaseId: string;
      previewUrl?: string | null;
      audioUrl?: string | null;
      audioFormat?: string | null;
    }) => {
      const parentRelease = rows.find(r => r.id === track.releaseId);
      openTrackDrawer({
        id: track.id,
        title: track.title,
        slug: track.slug,
        smartLinkPath: track.smartLinkPath,
        trackNumber: track.trackNumber,
        discNumber: track.discNumber,
        durationMs: track.durationMs,
        isrc: track.isrc,
        isExplicit: track.isExplicit,
        previewUrl: track.previewUrl ?? null,
        audioUrl: track.audioUrl ?? null,
        audioFormat: track.audioFormat ?? null,
        providers: track.providers,
        releaseTitle: parentRelease?.title ?? '',
        releaseArtworkUrl: parentRelease?.artworkUrl,
        releaseId: track.releaseId,
      });
    },
    [rows, openTrackDrawer]
  );

  // Table display preferences (column visibility)
  const {
    columnVisibility,
    rowHeight,
    availableColumns,
    onColumnVisibilityChange,
    resetToDefaults,
    groupByYear,
    onGroupByYearChange,
  } = useReleaseTablePreferences();

  // Filter state
  const [filters, setFilters] = useState<ReleaseFilters>(
    DEFAULT_RELEASE_FILTERS
  );

  // Release view filter state (Tracks / Releases)
  const [releaseView, setReleaseView] = useState<ReleaseView>('releases');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchInputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);

  // Derive showTracks from releaseView toggle
  const showTracksFromView = releaseView === 'tracks';

  // Apply filters and search to rows
  const filteredRows = useMemo(
    () => filterReleases(rows, filters, deferredSearchQuery),
    [rows, filters, deferredSearchQuery]
  );

  // Smart link gating
  const {
    smartLinksLimit,
    isPro,
    canCreateManualReleases,
    canEditSmartLinks,
    canAccessFutureReleases,
  } = usePlanGate();

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

  const { importedCount } = useImportPolling({
    enabled: isImporting,
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
          setAmArtistName(result.artistName);
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
    (connected: boolean, name: string | null) => {
      setIsAmConnected(connected);
      setAmArtistName(name);
    },
    []
  );

  // Apple Music refresh handler
  const [isAmSyncing, setIsAmSyncing] = useState(false);
  const handleAppleMusicRescan = useCallback(async () => {
    setIsAmSyncing(true);
    try {
      const result = await rescanAppleMusicLinks();
      if (result.rateLimited) {
        toast.error(
          `Apple Music refresh is rate limited. Available again in ${result.retryAfter}.`
        );
      } else if (result.success) {
        toast.success(result.message);
        // Reload the page to pick up any new links
        router.refresh();
      } else {
        toast.error(result.message);
      }
    } catch {
      toast.error('Failed to refresh Apple Music links');
    } finally {
      setIsAmSyncing(false);
    }
  }, [router]);

  const handleNewRelease = useCallback(() => {
    const prompt =
      "I'd like to add a new release to my discography. Help me set it up.";
    const encoded = encodeURIComponent(prompt);
    router.push(`${APP_ROUTES.CHAT}?q=${encoded}`);
  }, [router]);

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
      setRows(prev => prev.map(row => (row.id === updated.id ? updated : row)));
    },
    [setRows]
  );

  // Show import progress banner when actively importing
  const showImportProgress = isImporting;
  // Show spinner-only state when importing but no releases loaded yet
  const showImportingState =
    isImporting && rows.length === 0 && importedCount === 0;
  // Show empty state when not connected and no releases
  const showEmptyState = !isConnected && !isImporting && rows.length === 0;
  // Show releases table when we have releases
  const showReleasesTable = rows.length > 0;

  const isReleaseSidebarOpen = Boolean(editingRelease);
  const isTrackSidebarOpen = Boolean(editingTrack);
  const isSidebarOpen = isReleaseSidebarOpen || isTrackSidebarOpen;

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
      rightPanelWidth: isSidebarOpen ? SIDEBAR_WIDTH : 0,
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

  // Set header badge (DSP pills on left) and actions (drawer toggle on right)
  const { setHeaderBadge, setHeaderActions } = useSetHeaderActions();

  // Memoize both badge and actions to avoid creating new JSX on every render
  // This is CRITICAL to prevent infinite render loops when updating context
  const headerActions = useMemo(
    () => (
      <div className='flex items-center gap-1'>
        {canCreateManualReleases && (
          <Button
            variant='ghost'
            size='sm'
            onClick={handleNewRelease}
            className='h-8 gap-1.5 border-none text-secondary-token hover:text-primary-token'
          >
            <Icon name='Plus' className='h-4 w-4' />
            <span className='hidden sm:inline'>New Release</span>
          </Button>
        )}
        <DrawerToggleButton />
      </div>
    ),
    [handleNewRelease, canCreateManualReleases]
  );

  const spotifyBadge = useMemo(() => {
    if (isConnected) {
      return (
        <button
          type='button'
          onClick={handleSync}
          disabled={isSyncing}
          className='group relative inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 py-1 pl-2.5 pr-3 text-xs font-medium text-[#1DB954] transition-colors hover:bg-[#1DB954]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]/50 focus-visible:ring-offset-2 disabled:opacity-60'
          aria-label={
            isSyncing ? 'Syncing with Spotify...' : 'Refresh from Spotify'
          }
        >
          <SocialIcon platform='spotify' className='h-4 w-4' />
          <span>{artistName || 'Connected'}</span>
          {/* Status dot - visible when not hovered/syncing */}
          <span
            className={cn(
              'h-2 w-2 rounded-full bg-[#1DB954] transition-opacity duration-150',
              'group-hover:opacity-0 group-focus-visible:opacity-0',
              isSyncing && 'opacity-0'
            )}
            aria-hidden='true'
          />
          {/* Refresh icon - visible on hover or when syncing */}
          <Icon
            name={isSyncing ? 'Loader2' : 'RefreshCw'}
            className={cn(
              'absolute right-2 h-4 w-4 opacity-0 transition-opacity duration-150',
              'group-hover:opacity-100 group-focus-visible:opacity-100',
              isSyncing && 'animate-spin opacity-100'
            )}
            aria-hidden='true'
          />
        </button>
      );
    }

    return (
      <DspConnectionPill
        provider='spotify'
        connected={false}
        onClick={() => setSpotifySearchOpen(true)}
      />
    );
  }, [artistName, handleSync, isConnected, isSyncing, setSpotifySearchOpen]);

  const appleMusicBadge = useMemo(
    () => (
      <DspConnectionPill
        provider='apple_music'
        connected={isAmConnected}
        artistName={amArtistName}
        onClick={isAmConnected ? undefined : () => setAmPaletteOpen(true)}
        onSyncNow={isAmConnected ? handleAppleMusicRescan : undefined}
        disabled={isAmSyncing}
      />
    ),
    [isAmConnected, amArtistName, handleAppleMusicRescan, isAmSyncing]
  );

  // DSP badges for subheader (moved from header)
  const dspBadges = useMemo(
    () => (
      <div className='flex items-center gap-2'>
        {spotifyBadge}
        {appleMusicBadge}
      </div>
    ),
    [spotifyBadge, appleMusicBadge]
  );

  // Header search input — shown when search is open
  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
  }, []);

  const headerBadgeContent = useMemo(() => {
    if (!isSearchOpen) return null; // Show default breadcrumb label

    return (
      <div className='flex flex-1 items-center gap-2'>
        <Icon
          name='Search'
          className='h-3.5 w-3.5 shrink-0 text-tertiary-token'
        />
        <input
          ref={searchInputRef}
          type='text'
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') handleSearchClose();
          }}
          placeholder='Search releases…'
          className='flex-1 bg-transparent text-[13px] text-primary-token placeholder:text-tertiary-token outline-none'
          aria-label='Search releases'
        />
        {searchQuery && (
          <button
            type='button'
            onClick={() => setSearchQuery('')}
            className='rounded p-0.5 text-tertiary-token hover:text-secondary-token transition-colors'
            aria-label='Clear search'
          >
            <Icon name='X' className='h-3.5 w-3.5' />
          </button>
        )}
      </div>
    );
  }, [isSearchOpen, searchQuery, handleSearchClose, searchInputRef]);

  useEffect(() => {
    // Search input or null (for default breadcrumb) on left side of header
    setHeaderBadge(headerBadgeContent);

    // New Release button + drawer toggle on right side (use memoized element to prevent infinite loops)
    setHeaderActions(headerActions);

    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderBadge/setHeaderActions are stable context setters
  }, [headerBadgeContent, headerActions]);

  // Register right panel with AuthShell - supports both release and track drawers
  const sidebarPanel = useMemo(() => {
    if (isTrackSidebarOpen) {
      return (
        <Suspense
          fallback={
            <div
              className='h-full animate-pulse bg-surface-2'
              style={{ width: SIDEBAR_WIDTH }}
            />
          }
        >
          <TrackSidebar
            track={editingTrack}
            isOpen={isTrackSidebarOpen}
            onClose={closeTrackDrawer}
            onBackToRelease={handleBackToReleaseFromTrack}
          />
        </Suspense>
      );
    }
    if (isReleaseSidebarOpen) {
      return (
        <Suspense
          fallback={
            <div
              className='h-full animate-pulse bg-surface-2'
              style={{ width: SIDEBAR_WIDTH }}
            />
          }
        >
          <ReleaseSidebar
            release={editingRelease}
            mode='admin'
            isOpen={isReleaseSidebarOpen}
            providerConfig={providerConfig}
            artistName={artistName}
            onClose={closeEditor}
            onRefresh={
              editingRelease
                ? () => handleRefreshRelease(editingRelease.id)
                : undefined
            }
            isRefreshing={refreshingReleaseId === editingRelease?.id}
            onAddDspLink={handleAddUrl}
            onRescanIsrc={
              editingRelease
                ? () => handleRescanIsrc(editingRelease.id)
                : undefined
            }
            isRescanningIsrc={isRescanningIsrc}
            onArtworkUpload={handleArtworkUpload}
            onArtworkRevert={handleArtworkRevert}
            onReleaseChange={handleReleaseChange}
            onSaveLyrics={handleSaveLyrics}
            onFormatLyrics={handleFormatLyrics}
            isLyricsSaving={isLyricsSaving}
            isSaving={isSaving}
            allowDownloads={allowArtworkDownloads}
            readOnly={!canEditSmartLinks}
            onCanvasStatusUpdate={handleCanvasStatusUpdate}
            onTrackClick={handleTrackClickFromRelease}
          />
        </Suspense>
      );
    }
    return null;
  }, [
    isReleaseSidebarOpen,
    isTrackSidebarOpen,
    editingRelease,
    editingTrack,
    providerConfig,
    artistName,
    closeEditor,
    closeTrackDrawer,
    handleRefreshRelease,
    handleBackToReleaseFromTrack,
    handleTrackClickFromRelease,
    refreshingReleaseId,
    handleAddUrl,
    handleRescanIsrc,
    isRescanningIsrc,
    handleArtworkUpload,
    handleArtworkRevert,
    handleReleaseChange,
    handleSaveLyrics,
    handleFormatLyrics,
    isLyricsSaving,
    isSaving,
    allowArtworkDownloads,
    canEditSmartLinks,
    handleCanvasStatusUpdate,
  ]);

  useRegisterRightPanel(sidebarPanel);

  return (
    <>
      <div
        className='flex h-full min-h-0 min-w-0 flex-col'
        data-testid='releases-matrix'
      >
        <h1 className='sr-only'>Releases</h1>
        <div className='flex-1 min-h-0 flex flex-col'>
          {/* Sticky subheader - outside scroll container */}
          {showReleasesTable && (
            <ReleaseTableSubheader
              releases={filteredRows}
              selectedIds={selectedIds}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={onColumnVisibilityChange}
              availableColumns={availableColumns}
              onResetToDefaults={resetToDefaults}
              filters={filters}
              onFiltersChange={setFilters}
              groupByYear={groupByYear}
              onGroupByYearChange={onGroupByYearChange}
              releaseView={releaseView}
              onReleaseViewChange={setReleaseView}
              dspBadges={dspBadges}
              isSearchOpen={isSearchOpen}
              onSearchToggle={() => setIsSearchOpen(open => !open)}
            />
          )}

          {/* Scrollable content area */}
          <div className='flex-1 min-h-0 overflow-auto pb-4'>
            {showImportProgress && (
              <ImportProgressBanner
                artistName={artistName}
                importedCount={importedCount}
              />
            )}

            {showEmptyState && (
              <ReleasesEmptyState
                onConnectSpotify={() => setSpotifySearchOpen(true)}
              />
            )}

            {/* Apple Music sync status banner — only when not already connected */}
            {showReleasesTable && rows[0]?.profileId && !isAmConnected && (
              <AppleMusicSyncBanner
                profileId={rows[0].profileId}
                spotifyConnected={isConnected}
                releases={rows}
                className='mx-4 mt-2'
                onMatchStatusChange={handleMatchStatusChange}
              />
            )}

            {showImportingState && (
              <div className='flex flex-1 flex-col items-center justify-center px-4 py-16 text-center'>
                <div className='flex h-16 w-16 items-center justify-center rounded-full bg-[#1DB954]/10'>
                  <Icon
                    name='Loader2'
                    className='h-8 w-8 text-[#1DB954] animate-spin'
                    aria-hidden='true'
                  />
                </div>
                <h3 className='mt-4 text-lg font-semibold text-primary-token'>
                  We&apos;re importing your music
                </h3>
                <p className='mt-1 max-w-sm text-sm text-secondary-token'>
                  {artistName
                    ? `Fetching releases from ${artistName}'s Spotify profile...`
                    : 'Fetching releases from Spotify...'}
                </p>
              </div>
            )}

            {/* Soft-cap banner: request higher limit when over 100 smart links */}
            {showReleasesTable &&
              !isPro &&
              releasedCount > SMART_LINK_SOFT_CAP && (
                <SmartLinkGateBanner
                  mode='soft-cap'
                  releasedCount={releasedCount}
                  softCap={SMART_LINK_SOFT_CAP}
                  className='mx-4 mt-2'
                />
              )}

            {/* Pre-release upsell for free users with unreleased music */}
            {showReleasesTable &&
              !isPro &&
              !canAccessFutureReleases &&
              unreleasedCount > 0 && (
                <SmartLinkGateBanner
                  mode='unreleased'
                  unreleasedCount={unreleasedCount}
                  className='mx-4 mt-2'
                />
              )}

            {showReleasesTable && (
              <QueryErrorBoundary>
                <ReleaseTable
                  releases={filteredRows}
                  providerConfig={providerConfig}
                  artistName={artistName}
                  onCopy={handleCopy}
                  onEdit={openEditor}
                  columnVisibility={columnVisibility}
                  rowHeight={rowHeight}
                  showTracks={showTracksFromView}
                  groupByYear={groupByYear}
                  selectedReleaseId={editingRelease?.id}
                  selectedTrackId={editingTrack?.id}
                  refreshingReleaseId={refreshingReleaseId}
                  flashedReleaseId={flashedReleaseId}
                  isSmartLinkLocked={isSmartLinkLocked}
                  getSmartLinkLockReason={getSmartLinkLockReason}
                  onTrackClick={openTrackDrawer}
                />
              </QueryErrorBoundary>
            )}

            {/* Show "No releases" state when connected but no releases and not importing */}
            {isConnected && rows.length === 0 && !isImporting && (
              <div className='flex flex-1 flex-col items-center justify-center px-4 py-16 text-center'>
                <div className='flex h-16 w-16 items-center justify-center rounded-full bg-surface-2'>
                  <Icon
                    name='Disc3'
                    className='h-8 w-8 text-tertiary-token'
                    aria-hidden='true'
                  />
                </div>
                <h3 className='mt-4 text-lg font-semibold text-primary-token'>
                  No releases yet
                </h3>
                <p className='mt-1 max-w-sm text-sm text-secondary-token'>
                  {canCreateManualReleases
                    ? 'Sync your releases from Spotify or create one manually to start generating smart links.'
                    : 'Sync your releases from Spotify to start generating smart links.'}
                </p>
                <div className='mt-4 flex items-center gap-3'>
                  <Button
                    variant='primary'
                    size='sm'
                    disabled={isSyncing}
                    onClick={handleSync}
                    className='inline-flex items-center gap-2'
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
                  </Button>
                  {canCreateManualReleases && (
                    <Button
                      variant='secondary'
                      size='sm'
                      onClick={handleNewRelease}
                      className='inline-flex items-center gap-2'
                      data-testid='create-release-empty-state'
                    >
                      <Icon
                        name='Plus'
                        className='h-4 w-4'
                        aria-hidden='true'
                      />
                      Create Release
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Apple Music artist search command palette */}
      <ArtistSearchCommandPalette
        open={amPaletteOpen}
        onOpenChange={setAmPaletteOpen}
        provider='apple_music'
        onArtistSelect={handleAppleMusicConnect}
      />

      <Suspense fallback={null}>
        <SpotifyConnectDialog
          open={spotifySearchOpen}
          onOpenChange={setSpotifySearchOpen}
          onConnected={handleArtistConnected}
          onImportStart={handleImportStart}
        />
      </Suspense>
    </>
  );
});
