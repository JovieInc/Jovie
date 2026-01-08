'use client';

import { Button } from '@jovie/ui';
import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  ReleaseEditDialog,
  ReleaseTableRow,
} from '@/components/dashboard/organisms/releases';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { ReleasesEmptyState } from './ReleasesEmptyState';
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
    drafts,
    isSaving,
    isSyncing,
    headerElevated,
    tableContainerRef,
    providerList,
    totalReleases,
    totalOverrides,
    openEditor,
    closeEditor,
    handleCopy,
    handleSave,
    handleReset,
    handleSync,
    setDrafts,
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

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='releases-matrix'>
      <h1 className='sr-only'>Discography</h1>
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6'>
          <div className='flex items-center gap-3'>
            <p className='text-sm font-semibold uppercase tracking-[0.12em] text-secondary-token'>
              Discography
            </p>
            {isConnected && artistName && (
              <span className='inline-flex items-center gap-1.5 rounded-full border border-[#1DB954]/30 bg-[#1DB954]/10 px-2.5 py-1 text-xs font-medium text-[#1DB954]'>
                <SocialIcon platform='spotify' className='h-3 w-3' />
                {artistName}
              </span>
            )}
          </div>
          <div className='flex items-center gap-3'>
            {totalReleases > 0 && (
              <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-secondary-token'>
                {totalReleases} {totalReleases === 1 ? 'release' : 'releases'}
              </span>
            )}
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
                variant='secondary'
                size='sm'
                disabled={isSyncing}
                onClick={handleSync}
                data-testid='sync-spotify-button'
                className='inline-flex items-center gap-2'
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
            )}
          </div>
        </div>
      </div>

      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto' ref={tableContainerRef}>
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
              <table
                className='w-full min-w-[1000px] border-separate border-spacing-0 text-[13px]'
                aria-label='Releases table'
              >
                <caption className='sr-only'>
                  Table showing all releases with smart links and provider
                  availability
                </caption>
                <thead
                  className={cn(
                    'sticky top-0 z-20 bg-surface-1/75 backdrop-blur-md',
                    headerElevated &&
                      'shadow-sm shadow-black/10 dark:shadow-black/40'
                  )}
                >
                  <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
                    <th className='w-[280px] border-b border-subtle px-4 py-3 text-left font-semibold sm:px-6'>
                      Release
                    </th>
                    <th className='w-[160px] border-b border-subtle px-4 py-3 text-left font-semibold sm:px-6'>
                      Smart Link
                    </th>
                    {primaryProviders.map(provider => (
                      <th
                        key={provider}
                        className='border-b border-subtle px-4 py-3 text-left font-semibold sm:px-6'
                      >
                        <div className='flex items-center gap-2'>
                          <span
                            className='h-2 w-2 shrink-0 rounded-full'
                            style={{
                              backgroundColor: providerConfig[provider].accent,
                            }}
                            aria-hidden='true'
                          />
                          {providerConfig[provider].label}
                        </div>
                      </th>
                    ))}
                    <th className='w-[100px] border-b border-subtle px-4 py-3 text-right font-semibold sm:px-6'>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((release, index) => (
                    <ReleaseTableRow
                      key={release.slug}
                      release={release}
                      index={index}
                      totalRows={rows.length}
                      primaryProviders={primaryProviders}
                      providerConfig={providerConfig}
                      onCopy={handleCopy}
                      onEdit={openEditor}
                    />
                  ))}
                </tbody>
              </table>
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
                  Sync your discography from Spotify to start generating smart
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
            <div className='sticky bottom-0 z-20 flex items-center justify-between border-t border-subtle bg-surface-1/75 px-4 py-3 text-xs text-secondary-token backdrop-blur-md sm:px-6'>
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

      <ReleaseEditDialog
        release={editingRelease}
        providerList={providerList}
        drafts={drafts}
        isSaving={isSaving}
        onDraftChange={(provider, value) =>
          setDrafts(prev => ({ ...prev, [provider]: value }))
        }
        onSave={handleSave}
        onReset={handleReset}
        onClose={closeEditor}
      />
    </div>
  );
}
