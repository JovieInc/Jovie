'use client';

import { Button } from '@jovie/ui';
import { Copy } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { useTableMeta } from '@/components/organisms/AuthShellWrapper';
import { ReleaseSidebar } from '@/components/organisms/release-sidebar';
import { useRowSelection } from '@/components/organisms/table';
import { useHeaderActions } from '@/contexts/HeaderActionsContext';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { ReleasesEmptyState } from './ReleasesEmptyState';
import { ReleaseTable } from './ReleaseTable';
import type { ReleaseProviderMatrixProps } from './types';
import { useReleaseProviderMatrix } from './useReleaseProviderMatrix';

export function ReleaseProviderMatrix({
  profileId,
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
    handleAddUrl,
  } = useReleaseProviderMatrix({
    profileId,
    releases,
    providerConfig,
    primaryProviders,
  });

  // Row selection
  const rowIds = useMemo(() => rows.map(r => r.id), [rows]);
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
            .map(r => `${window.location.origin}${r.smartLinkPath}`)
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

  const handleArtistConnected = (
    newReleases: ReleaseViewModel[],
    newArtistName: string
  ) => {
    setIsConnected(true);
    setArtistName(newArtistName);
    setRows(newReleases);
    setIsImporting(false);
  };

  const handleImportStart = (importingArtistName: string) => {
    setIsImporting(true);
    setArtistName(importingArtistName);
  };

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
  }, [
    editingRelease,
    rows.length,
    closeEditor,
    openEditor,
    isSidebarOpen,
    setTableMeta,
  ]);

  // Set header badge (Spotify pill on left) and actions (drawer toggle on right)
  const { setHeaderBadge, setHeaderActions } = useHeaderActions();

  useEffect(() => {
    // Spotify pill on left side of header
    if (isConnected && artistName) {
      setHeaderBadge(
        <span className='inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-2.5 py-1 text-xs font-medium text-[#1DB954]'>
          <SocialIcon platform='spotify' className='h-3 w-3' />
          {artistName}
        </span>
      );
    } else {
      setHeaderBadge(null);
    }

    // Drawer toggle on right side
    setHeaderActions(<DrawerToggleButton />);

    return () => {
      setHeaderBadge(null);
      setHeaderActions(null);
    };
  }, [isConnected, artistName, setHeaderBadge, setHeaderActions]);

  return (
    <div className='flex h-full min-h-0 flex-row' data-testid='releases-matrix'>
      {/* Main content area */}
      <div className='flex h-full min-h-0 min-w-0 flex-1 flex-col'>
        <h1 className='sr-only'>Releases</h1>
        <div className='flex-1 min-h-0 flex flex-col bg-base'>
          {/* Scrollable content area */}
          <div className='flex-1 min-h-0 overflow-auto'>
            {showEmptyState && (
              <ReleasesEmptyState
                onConnected={handleArtistConnected}
                onImportStart={handleImportStart}
              />
            )}

            {showImportingState && (
              <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
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
              <ReleaseTable
                releases={rows}
                providerConfig={providerConfig}
                artistName={artistName}
                onCopy={handleCopy}
                onEdit={openEditor}
                onAddUrl={handleAddUrl}
                onSync={handleSync}
                isAddingUrl={isSaving}
                isSyncing={isSyncing}
                selectedIds={selectedIds}
                onSelectionChange={setSelection}
                bulkActions={bulkActions}
                onClearSelection={clearSelection}
              />
            )}

            {/* Show "No releases" state when connected but no releases and not importing */}
            {isConnected && rows.length === 0 && !isImporting && (
              <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
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

          {/* Footer - direct flex child anchored to bottom */}
          {rows.length > 0 && (
            <div className='flex items-center justify-between border-t border-subtle bg-base px-4 py-3 text-xs text-secondary-token sm:px-6'>
              <span>
                {totalReleases} {totalReleases === 1 ? 'release' : 'releases'}
                {totalOverrides > 0 && (
                  <span className='ml-1.5 text-tertiary-token'>
                    ({totalOverrides} manual{' '}
                    {totalOverrides === 1 ? 'override' : 'overrides'})
                  </span>
                )}
              </span>
              <div className='flex items-center gap-2'>
                <span className='text-tertiary-token'>
                  Showing {primaryProviders.length} of{' '}
                  {Object.keys(providerConfig).length} providers
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Release Sidebar */}
      <ReleaseSidebar
        release={editingRelease}
        mode='admin'
        isOpen={isSidebarOpen}
        providerConfig={providerConfig}
        artistName={artistName}
        onClose={closeEditor}
        onRefresh={handleSync}
        onAddDspLink={handleAddUrl}
        isSaving={isSaving}
      />
    </div>
  );
}
