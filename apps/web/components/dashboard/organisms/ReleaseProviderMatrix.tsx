'use client';

import { Badge, Button } from '@jovie/ui';
import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';
import { useReleaseProviderMatrix } from '@/components/dashboard/hooks/useReleaseProviderMatrix';
import { ProviderInputCard } from '@/components/dashboard/molecules/ProviderInputCard';
import { ReleaseMatrixEmptyState } from '@/components/dashboard/molecules/ReleaseMatrixEmptyState';
import { ReleaseMatrixHeader } from '@/components/dashboard/molecules/ReleaseMatrixHeader';
import { ReleaseTableRow } from '@/components/dashboard/molecules/ReleaseTableRow';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

interface ReleaseProviderMatrixProps {
  releases: ReleaseViewModel[];
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  primaryProviders: ProviderKey[];
  spotifyConnected?: boolean;
}

export function ReleaseProviderMatrix({
  releases,
  providerConfig,
  primaryProviders,
  spotifyConnected = false,
}: ReleaseProviderMatrixProps) {
  const {
    rows,
    editingRelease,
    drafts,
    isSaving,
    isSyncing,
    headerElevated,
    tableContainerRef,
    providerList,
    totalReleases,
    totalOverrides,
    setDrafts,
    openEditor,
    closeEditor,
    handleCopy,
    handleSave,
    handleReset,
    handleSync,
  } = useReleaseProviderMatrix({
    releases,
    providerConfig,
    primaryProviders,
  });

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='releases-matrix'>
      {/* Header */}
      <ReleaseMatrixHeader
        totalReleases={totalReleases}
        totalOverrides={totalOverrides}
        spotifyConnected={spotifyConnected}
        isSyncing={isSyncing}
        onSync={handleSync}
      />

      {/* Table container */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto' ref={tableContainerRef}>
            {rows.length === 0 ? (
              <ReleaseMatrixEmptyState
                spotifyConnected={spotifyConnected}
                isSyncing={isSyncing}
                onSync={handleSync}
              />
            ) : (
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
                      primaryProviders={primaryProviders}
                      providerConfig={providerConfig}
                      isLast={index === rows.length - 1}
                      onCopy={handleCopy}
                      onEdit={() => openEditor(release)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
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

      {/* Edit dialog */}
      <Dialog open={Boolean(editingRelease)} onClose={closeEditor} size='3xl'>
        <DialogTitle className='flex items-center gap-3 text-xl font-semibold text-primary-token'>
          <Icon
            name='Link'
            className='h-5 w-5 text-secondary-token'
            aria-hidden='true'
          />
          Edit release links
        </DialogTitle>
        <DialogDescription className='text-sm text-secondary-token'>
          Swap in a preferred DSP link or revert back to our detected URL. All
          changes are live for your smart link immediately.
        </DialogDescription>
        <DialogBody className='space-y-4'>
          {editingRelease ? (
            <div className='space-y-4'>
              {/* Release info header */}
              <div className='flex items-center gap-4 rounded-xl border border-subtle bg-surface-2/60 p-4'>
                {/* Artwork */}
                <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm'>
                  {editingRelease.artworkUrl ? (
                    <Image
                      src={editingRelease.artworkUrl}
                      alt={`${editingRelease.title} artwork`}
                      fill
                      className='object-cover'
                      sizes='64px'
                    />
                  ) : (
                    <div className='flex h-full w-full items-center justify-center'>
                      <Icon
                        name='Disc3'
                        className='h-8 w-8 text-tertiary-token'
                        aria-hidden='true'
                      />
                    </div>
                  )}
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='text-base font-semibold text-primary-token'>
                    {editingRelease.title}
                  </p>
                  <p className='mt-0.5 text-xs text-secondary-token'>
                    Smart link: {editingRelease.smartLinkPath}
                  </p>
                  <Badge
                    variant='secondary'
                    className='mt-2 border border-subtle bg-transparent text-xs text-secondary-token'
                  >
                    {editingRelease.releaseDate
                      ? new Date(
                          editingRelease.releaseDate
                        ).toLocaleDateString()
                      : 'Date TBD'}
                  </Badge>
                </div>
              </div>

              {/* Provider inputs grid */}
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                {providerList.map(provider => {
                  const value = drafts[provider.key] ?? '';
                  const existing = editingRelease.providers.find(
                    entry => entry.key === provider.key
                  );

                  return (
                    <ProviderInputCard
                      key={`${editingRelease.id}-${provider.key}`}
                      provider={provider}
                      value={value}
                      existingSource={existing?.source}
                      existingUrl={existing?.url}
                      releaseId={editingRelease.id}
                      isSaving={isSaving}
                      onValueChange={newValue =>
                        setDrafts(prev => ({
                          ...prev,
                          [provider.key]: newValue,
                        }))
                      }
                      onSave={() => handleSave(provider.key)}
                      onReset={() => handleReset(provider.key)}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogActions className='justify-end'>
          <Button variant='secondary' size='sm' onClick={closeEditor}>
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
