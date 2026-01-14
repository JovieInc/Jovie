'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ReleaseSidebar } from '@/components/organisms/release-sidebar';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { ReleasesEmptyState } from './ReleasesEmptyState';
import { ReleaseTable } from './ReleaseTable';
import type { ReleaseProviderMatrixProps } from './types';
import { useReleaseProviderMatrix } from './useReleaseProviderMatrix';

export function ReleaseProviderMatrix({
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
  } = useReleaseProviderMatrix({ releases, providerConfig, primaryProviders });

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

  return (
    <div className='flex h-full min-h-0 flex-row' data-testid='releases-matrix'>
      {/* Main content area */}
      <div className='flex h-full min-h-0 flex-1 flex-col'>
        <h1 className='sr-only'>Releases</h1>
        <div className='shrink-0 border-b border-subtle'>
          <div className='flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6'>
            <div className='flex items-center gap-3'>
              <p className='text-sm font-semibold uppercase tracking-[0.12em] text-secondary-token'>
                Releases
              </p>
              {isConnected && artistName && (
                <span className='inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-2.5 py-1 text-xs font-medium text-[#1DB954]'>
                  <SocialIcon platform='spotify' className='h-3 w-3' />
                  {artistName}
                </span>
              )}
            </div>
            <div className='flex items-center gap-3'>
              {totalOverrides > 0 && (
                <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'>
                  <Icon
                    name='PencilLine'
                    className='h-3 w-3'
                    aria-hidden='true'
                  />
                  {totalOverrides}{' '}
                  {totalOverrides === 1 ? 'override' : 'overrides'}
                </span>
              )}
              {isConnected && (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={isSyncing}
                  onClick={handleSync}
                  data-testid='sync-spotify-button'
                  className='rounded-lg border-subtle hover:bg-base'
                  aria-label='Sync releases from Spotify'
                  aria-busy={isSyncing}
                >
                  <Icon
                    name={isSyncing ? 'Loader2' : 'RefreshCw'}
                    className={cn(
                      'h-3.5 w-3.5',
                      isSyncing && 'animate-spin motion-reduce:animate-none'
                    )}
                    aria-hidden='true'
                  />
                  <span>{isSyncing ? 'Syncing...' : 'Sync from Spotify'}</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className='flex-1 min-h-0 overflow-hidden'>
          <div className='flex h-full min-h-0 flex-col bg-base'>
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
                  primaryProviders={primaryProviders}
                  providerConfig={providerConfig}
                  artistName={artistName}
                  onCopy={handleCopy}
                  onEdit={openEditor}
                  onAddUrl={handleAddUrl}
                  onSync={handleSync}
                  isAddingUrl={isSaving}
                  isSyncing={isSyncing}
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

            {rows.length > 0 && (
              <div className='sticky bottom-0 z-20 flex items-center justify-between border-t border-subtle bg-base/75 px-4 py-3 text-xs text-secondary-token backdrop-blur-md sm:px-6'>
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
      </div>

      {/* Release Sidebar */}
      <ReleaseSidebar
        release={editingRelease}
        mode='admin'
        isOpen={isSidebarOpen}
        providerConfig={providerConfig}
        onClose={closeEditor}
        onRefresh={handleSync}
        onAddDspLink={handleAddUrl}
        isSaving={isSaving}
      />
    </div>
  );
}
