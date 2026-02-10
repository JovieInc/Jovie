'use client';

import { Button } from '@jovie/ui';
import { useRouter } from 'next/navigation';
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { connectAppleMusicArtist } from '@/app/app/(shell)/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { DspConnectionPill } from '@/components/dashboard/atoms/DspConnectionPill';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { ArtistSearchCommandPalette } from '@/components/organisms/artist-search-palette';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { QueryErrorBoundary } from '@/lib/queries/QueryErrorBoundary';
import { cn } from '@/lib/utils';
import { AppleMusicSyncBanner } from './AppleMusicSyncBanner';
import { getPopularityLevel } from './hooks/useReleaseFilterCounts';
import { useReleaseTablePreferences } from './hooks/useReleaseTablePreferences';
import { ReleasesEmptyState } from './ReleasesEmptyState';
import { ReleaseTable } from './ReleaseTable';
import {
  DEFAULT_RELEASE_FILTERS,
  type ReleaseFilters,
  type ReleaseTab,
  ReleaseTableSubheader,
  type ReleaseView,
} from './ReleaseTableSubheader';
import type { ReleaseProviderMatrixProps } from './types';
import { useReleaseProviderMatrix } from './useReleaseProviderMatrix';

// Lazy load ReleaseSidebar - reduces initial bundle by ~30-50KB
const ReleaseSidebar = lazy(() =>
  import('@/components/organisms/release-sidebar').then(m => ({
    default: m.ReleaseSidebar,
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
}: ReleaseProviderMatrixProps) {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(spotifyConnected);
  const [artistName, setArtistName] = useState(spotifyArtistName);
  const [isImporting, setIsImporting] = useState(false);

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
    totalReleases,
    totalOverrides,
    openEditor,
    closeEditor,
    handleCopy,
    handleSync,
    handleRefreshRelease,
    handleAddUrl,
  } = useReleaseProviderMatrix({ releases, providerConfig, primaryProviders });

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

  // Data tab state (Catalog / Links / Details)
  const [releaseTab, setReleaseTab] = useState<ReleaseTab>('catalog');

  // Derive showTracks from releaseView toggle
  const showTracksFromView = releaseView === 'tracks';

  // Apply filters to rows
  const filteredRows = useMemo(() => {
    return rows.filter(release => {
      // Filter by release type (from advanced filters)
      const matchesType =
        filters.releaseTypes.length === 0 ||
        filters.releaseTypes.includes(release.releaseType);

      if (!matchesType) return false;

      // Filter by popularity level
      if (filters.popularity.length > 0) {
        const level = getPopularityLevel(release.spotifyPopularity);
        if (!level || !filters.popularity.includes(level)) return false;
      }

      // Filter by label
      if (filters.labels.length > 0) {
        if (!release.label || !filters.labels.includes(release.label))
          return false;
      }

      return true;
    });
  }, [rows, filters]);

  // Empty selection for subheader export (simplified - no bulk selection)
  const selectedIds = useMemo(() => new Set<string>(), []);

  const handleArtistConnected = useCallback(
    (newReleases: ReleaseViewModel[], newArtistName: string) => {
      setIsConnected(true);
      setArtistName(newArtistName);
      setRows(newReleases);
      setIsImporting(false);
    },
    [setRows]
  );

  const handleImportStart = useCallback((importingArtistName: string) => {
    setIsImporting(true);
    setArtistName(importingArtistName);
  }, []);

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

  // Handle release changes from the sidebar (e.g., after artwork upload)
  const handleReleaseChange = useCallback(
    (updated: ReleaseViewModel) => {
      setRows(prev => prev.map(row => (row.id === updated.id ? updated : row)));
    },
    [setRows]
  );

  // Show importing state when we're actively importing
  const showImportingState = isImporting && rows.length === 0;
  // Show empty state when not connected and no releases
  const showEmptyState = !isConnected && !isImporting && rows.length === 0;
  // Show releases table when we have releases or when connected and not importing
  const showReleasesTable = rows.length > 0;

  const isSidebarOpen = Boolean(editingRelease);

  // Connect to tableMeta for drawer toggle button
  const { setTableMeta } = useTableMeta();

  // Use ref to avoid infinite loop - rows array reference changes each render
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    // Toggle function: close if open, open first release if closed
    const toggle = () => {
      if (editingRelease) {
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
  }, [editingRelease, rows.length, closeEditor, openEditor, isSidebarOpen]);

  // Set header badge (DSP pills on left) and actions (drawer toggle on right)
  const { setHeaderBadge, setHeaderActions } = useSetHeaderActions();

  // Memoize both badge and actions to avoid creating new JSX on every render
  // This is CRITICAL to prevent infinite render loops when updating context
  const headerActions = useMemo(
    () => (
      <div className='flex items-center gap-1'>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleNewRelease}
          className='h-8 gap-1.5 border-none text-secondary-token hover:text-primary-token'
        >
          <Icon name='Plus' className='h-4 w-4' />
          <span className='hidden sm:inline'>New Release</span>
        </Button>
        <DrawerToggleButton />
      </div>
    ),
    [handleNewRelease]
  );

  const spotifyBadge = useMemo(
    () =>
      isConnected && artistName ? (
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
          <span>{artistName}</span>
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
      ) : null,
    [isConnected, artistName, handleSync, isSyncing]
  );

  const appleMusicBadge = useMemo(
    () => (
      <DspConnectionPill
        provider='apple_music'
        connected={isAmConnected}
        artistName={amArtistName}
        onClick={isAmConnected ? undefined : () => setAmPaletteOpen(true)}
      />
    ),
    [isAmConnected, amArtistName]
  );

  const headerBadges = useMemo(
    () => (
      <div className='flex items-center gap-2'>
        {spotifyBadge}
        {appleMusicBadge}
      </div>
    ),
    [spotifyBadge, appleMusicBadge]
  );

  useEffect(() => {
    // DSP pills on left side of header
    setHeaderBadge(headerBadges);

    // New Release button + drawer toggle on right side (use memoized element to prevent infinite loops)
    setHeaderActions(headerActions);

    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderBadge/setHeaderActions are stable context setters
  }, [headerBadges, headerActions]);

  return (
    <div className='flex h-full min-h-0 flex-row' data-testid='releases-matrix'>
      {/* Main content area */}
      <div className='flex h-full min-h-0 min-w-0 flex-1 flex-col'>
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
              releaseTab={releaseTab}
              onReleaseTabChange={setReleaseTab}
            />
          )}

          {/* Scrollable content area */}
          <div className='flex-1 min-h-0 overflow-auto pb-4'>
            {showEmptyState && (
              <ReleasesEmptyState
                onConnected={handleArtistConnected}
                onImportStart={handleImportStart}
              />
            )}

            {/* Apple Music sync status banner */}
            {showReleasesTable && rows[0]?.profileId && (
              <AppleMusicSyncBanner
                profileId={rows[0].profileId}
                spotifyConnected={isConnected}
                releases={rows}
                className='mx-4 mt-2'
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

            {showReleasesTable && (
              <QueryErrorBoundary>
                <ReleaseTable
                  releases={filteredRows}
                  providerConfig={providerConfig}
                  artistName={artistName}
                  onCopy={handleCopy}
                  onEdit={openEditor}
                  onAddUrl={handleAddUrl}
                  isAddingUrl={isSaving}
                  columnVisibility={columnVisibility}
                  rowHeight={rowHeight}
                  showTracks={showTracksFromView}
                  groupByYear={groupByYear}
                  activeTab={releaseTab}
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
                  Sync your releases from Spotify or create one manually to
                  start generating smart links.
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
                  <Button
                    variant='secondary'
                    size='sm'
                    onClick={handleNewRelease}
                    className='inline-flex items-center gap-2'
                    data-testid='create-release-empty-state'
                  >
                    <Icon name='Plus' className='h-4 w-4' aria-hidden='true' />
                    Create Release
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer - simplified count + reset */}
          {rows.length > 0 && (
            <div className='flex items-center justify-between border-t border-subtle px-4 py-2 text-xs text-secondary-token'>
              <span>
                {filteredRows.length === rows.length
                  ? `${totalReleases}`
                  : `${filteredRows.length} of ${totalReleases}`}{' '}
                {totalReleases === 1 ? 'release' : 'releases'}
                {totalOverrides > 0 && (
                  <span className='ml-1.5 text-tertiary-token'>
                    ({totalOverrides} manual{' '}
                    {totalOverrides === 1 ? 'override' : 'overrides'})
                  </span>
                )}
              </span>
              <button
                type='button'
                onClick={resetToDefaults}
                className='text-xs text-tertiary-token hover:text-secondary-token transition-colors rounded focus-visible:outline-none focus-visible:bg-interactive-hover'
              >
                Reset display
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Release Sidebar - Lazy loaded to reduce initial bundle */}
      {isSidebarOpen && (
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
            isOpen={isSidebarOpen}
            providerConfig={providerConfig}
            artistName={artistName}
            onClose={closeEditor}
            onRefresh={
              editingRelease
                ? () => handleRefreshRelease(editingRelease.id)
                : undefined
            }
            onAddDspLink={handleAddUrl}
            onArtworkUpload={handleArtworkUpload}
            onReleaseChange={handleReleaseChange}
            isSaving={isSaving}
            allowDownloads={allowArtworkDownloads}
          />
        </Suspense>
      )}

      {/* Apple Music artist search command palette */}
      <ArtistSearchCommandPalette
        open={amPaletteOpen}
        onOpenChange={setAmPaletteOpen}
        provider='apple_music'
        onArtistSelect={handleAppleMusicConnect}
      />
    </div>
  );
});
