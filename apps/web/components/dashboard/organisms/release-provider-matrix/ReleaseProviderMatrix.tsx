'use client';

import { Button } from '@jovie/ui';
import { Copy } from 'lucide-react';
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
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { useRowSelection } from '@/components/organisms/table';
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
}: ReleaseProviderMatrixProps) {
  const [isConnected, setIsConnected] = useState(spotifyConnected);
  const [artistName, setArtistName] = useState(spotifyArtistName);
  const [isImporting, setIsImporting] = useState(false);

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
    showTracks,
    onShowTracksChange,
    groupByYear,
    onGroupByYearChange,
  } = useReleaseTablePreferences();

  // Filter state
  const [filters, setFilters] = useState<ReleaseFilters>(
    DEFAULT_RELEASE_FILTERS
  );

  // Release view filter state (All / Singles / Albums)
  const [releaseView, setReleaseView] = useState<ReleaseView>('all');

  // Apply filters to rows
  const filteredRows = useMemo(() => {
    return rows.filter(release => {
      // Quick filter by release view (Singles/Albums toggle)
      if (releaseView === 'singles' && release.releaseType !== 'single') {
        return false;
      }
      // Albums includes: album, ep, compilation (everything that's not a single)
      if (releaseView === 'albums' && release.releaseType === 'single') {
        return false;
      }

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
  }, [rows, filters, releaseView]);

  // Row selection - use filtered rows
  const rowIds = useMemo(() => filteredRows.map(r => r.id), [filteredRows]);
  const { selectedIds, clearSelection, setSelection } = useRowSelection(rowIds);

  // Bulk actions
  const bulkActions = useMemo(() => {
    const selectedReleases = rows.filter(r => selectedIds.has(r.id));

    return [
      {
        label: 'Copy Smart Links',
        icon: <Copy className='h-4 w-4' />,
        onClick: () => {
          const links = selectedReleases
            .map(r => `${globalThis.location.origin}${r.smartLinkPath}`)
            .join('\n');
          navigator.clipboard.writeText(links);
          clearSelection();
        },
      },
      {
        label: 'Copy Titles',
        icon: <Copy className='h-4 w-4' />,
        onClick: () => {
          const titles = selectedReleases.map(r => r.title).join('\n');
          navigator.clipboard.writeText(titles);
          clearSelection();
        },
      },
    ];
  }, [rows, selectedIds, clearSelection]);

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

  // Set header badge (Spotify pill on left) and actions (drawer toggle on right)
  const { setHeaderBadge, setHeaderActions } = useSetHeaderActions();

  // Memoize both badge and actions to avoid creating new JSX on every render
  // This is CRITICAL to prevent infinite render loops when updating context
  const drawerToggle = useMemo(() => <DrawerToggleButton />, []);

  const spotifyBadge = useMemo(
    () => (
      <button
        type='button'
        onClick={handleSync}
        disabled={isSyncing}
        className='group relative inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 py-1 pl-2.5 pr-3 text-xs font-medium text-[#1DB954] transition-colors hover:bg-[#1DB954]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1DB954]/50 focus-visible:ring-offset-2 disabled:opacity-60'
        aria-label={
          isSyncing ? 'Syncing with Spotify...' : 'Refresh from Spotify'
        }
      >
        <SocialIcon platform='spotify' className='h-3 w-3' />
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
            'absolute right-2 h-3 w-3 opacity-0 transition-opacity duration-150',
            'group-hover:opacity-100 group-focus-visible:opacity-100',
            isSyncing && 'animate-spin opacity-100'
          )}
          aria-hidden='true'
        />
      </button>
    ),
    [artistName, handleSync, isSyncing]
  );

  useEffect(() => {
    // Spotify pill on left side of header
    setHeaderBadge(isConnected && artistName ? spotifyBadge : null);

    // Drawer toggle on right side (use memoized element to prevent infinite loops)
    setHeaderActions(drawerToggle);

    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setHeaderBadge/setHeaderActions are stable context setters
  }, [isConnected, artistName, spotifyBadge, drawerToggle]);

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
              showTracks={showTracks}
              onShowTracksChange={onShowTracksChange}
              groupByYear={groupByYear}
              onGroupByYearChange={onGroupByYearChange}
              releaseView={releaseView}
              onReleaseViewChange={setReleaseView}
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
                  selectedIds={selectedIds}
                  onSelectionChange={setSelection}
                  bulkActions={bulkActions}
                  onClearSelection={clearSelection}
                  columnVisibility={columnVisibility}
                  rowHeight={rowHeight}
                  showTracks={showTracks}
                  groupByYear={groupByYear}
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
                  Sync your releases from Spotify to start generating smart
                  links for your releases.
                </p>
                <Button
                  variant='primary'
                  size='sm'
                  disabled={isSyncing}
                  onClick={handleSync}
                  className='mt-4 inline-flex items-center gap-2'
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
            onRefresh={editingRelease ? () => handleRefreshRelease(editingRelease.id) : undefined}
            onAddDspLink={handleAddUrl}
            isSaving={isSaving}
          />
        </Suspense>
      )}
    </div>
  );
});
