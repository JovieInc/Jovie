'use client';

import { Badge, Button, Input } from '@jovie/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  resetProviderOverride,
  saveProviderOverride,
  syncFromSpotify,
} from '@/app/app/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ReleaseProviderMatrixProps {
  releases: ReleaseViewModel[];
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  primaryProviders: ProviderKey[];
  spotifyConnected?: boolean;
}

type DraftState = Partial<Record<ProviderKey, string>>;

async function copyToClipboard(text: string): Promise<boolean> {
  const fallbackCopy = (value: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (error) {
      console.error('Fallback copy failed', error);
      return false;
    }
  };

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopy(text);
    }
  }

  return fallbackCopy(text);
}

function ProviderStatusDot({
  status,
  accent,
}: {
  status: 'available' | 'manual' | 'missing';
  accent: string;
}) {
  if (status === 'missing') {
    return (
      <span className='flex h-2.5 w-2.5 items-center justify-center rounded-full border border-subtle bg-surface-2'>
        <span className='h-1 w-1 rounded-full bg-tertiary-token' />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative flex h-2.5 w-2.5 items-center justify-center rounded-full',
        status === 'manual' && 'ring-2 ring-amber-400/30'
      )}
      style={{ backgroundColor: accent }}
    >
      {status === 'manual' && (
        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500' />
      )}
    </span>
  );
}

export function ReleaseProviderMatrix({
  releases,
  providerConfig,
  primaryProviders,
  spotifyConnected = false,
}: ReleaseProviderMatrixProps) {
  const [rows, setRows] = useState<ReleaseViewModel[]>(releases);
  const [editingRelease, setEditingRelease] = useState<ReleaseViewModel | null>(
    null
  );
  const [drafts, setDrafts] = useState<DraftState>({});
  const [isSaving, startSaving] = useTransition();
  const [isSyncing, startSyncing] = useTransition();
  const [headerElevated, setHeaderElevated] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setHeaderElevated(container.scrollTop > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const providerList = useMemo(
    () =>
      (Object.keys(providerConfig) as ProviderKey[]).map(key => ({
        key,
        label: providerConfig[key].label,
        accent: providerConfig[key].accent,
        isPrimary: primaryProviders.includes(key),
      })),
    [providerConfig, primaryProviders]
  );

  const openEditor = (release: ReleaseViewModel) => {
    setEditingRelease(release);
    const nextDrafts: DraftState = {};
    release.providers.forEach(provider => {
      nextDrafts[provider.key] = provider.url ?? '';
    });
    setDrafts(nextDrafts);
  };

  const closeEditor = () => {
    setEditingRelease(null);
    setDrafts({});
  };

  const updateRow = (updated: ReleaseViewModel) => {
    setRows(prev =>
      prev.map(row => (row.id === updated.id ? { ...updated } : row))
    );
    setEditingRelease(current =>
      current && current.id === updated.id ? { ...updated } : current
    );
  };

  const handleCopy = async (path: string, label: string, testId: string) => {
    const absoluteUrl = `${getBaseUrl()}${path}`;
    const success = await copyToClipboard(absoluteUrl);
    if (success) {
      toast.success(`${label} copied`, { id: testId });
    } else {
      toast.error('Unable to copy link', { id: `${testId}-error` });
    }
    return absoluteUrl;
  };

  const handleSave = (provider: ProviderKey) => {
    if (!editingRelease) return;
    const url = drafts[provider]?.trim() ?? '';
    if (!url) {
      toast.error('Enter a URL before saving');
      return;
    }

    startSaving(async () => {
      try {
        const updated = await saveProviderOverride({
          profileId: editingRelease.profileId,
          releaseId: editingRelease.id,
          provider,
          url,
        });
        updateRow(updated);
        toast.success('Link updated');
      } catch (error) {
        console.error(error);
        toast.error('Failed to save override');
      }
    });
  };

  const handleReset = (provider: ProviderKey) => {
    if (!editingRelease) return;

    startSaving(async () => {
      try {
        const updated = await resetProviderOverride({
          profileId: editingRelease.profileId,
          releaseId: editingRelease.id,
          provider,
        });
        updateRow(updated);
        setDrafts(prev => ({
          ...prev,
          [provider]:
            updated.providers.find(item => item.key === provider)?.url ?? '',
        }));
        toast.success('Reverted to detected link');
      } catch (error) {
        console.error(error);
        toast.error('Failed to reset link');
      }
    });
  };

  const handleSync = () => {
    startSyncing(async () => {
      try {
        const result = await syncFromSpotify();
        if (result.success) {
          toast.success(result.message);
          // Reload the page to get fresh data
          window.location.reload();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error(error);
        toast.error('Failed to sync from Spotify');
      }
    });
  };

  const totalReleases = rows.length;
  const totalOverrides = rows.reduce(
    (count, release) =>
      count + release.providers.filter(p => p.source === 'manual').length,
    0
  );

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='releases-matrix'>
      {/* Header */}
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div>
            <p className='text-sm font-semibold uppercase tracking-[0.12em] text-secondary-token'>
              Discography
            </p>
            <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
              Releases
            </h1>
            <p className='mt-1 max-w-2xl text-sm leading-6 text-secondary-token'>
              Share one smart link per release and keep provider URLs pristine.
              Copy-ready variants for each DSP make sure fans land in the right
              app every time.
            </p>
          </div>
          <div className='flex items-center gap-3'>
            <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-secondary-token'>
              {totalReleases} {totalReleases === 1 ? 'release' : 'releases'}
            </span>
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
            {spotifyConnected && (
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
                  className={cn('h-4 w-4', isSyncing && 'animate-spin')}
                  aria-hidden='true'
                />
                {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table container */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto' ref={tableContainerRef}>
            {rows.length === 0 ? (
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
                {spotifyConnected ? (
                  <>
                    <p className='mt-1 max-w-sm text-sm text-secondary-token'>
                      Sync your discography from Spotify to start generating
                      smart links for your releases.
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
                        className={cn('h-4 w-4', isSyncing && 'animate-spin')}
                        aria-hidden='true'
                      />
                      {isSyncing ? 'Syncing...' : 'Sync from Spotify'}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className='mt-1 max-w-sm text-sm text-secondary-token'>
                      Connect your Spotify artist profile to import your
                      releases and generate smart links.
                    </p>
                    <Link
                      href='/app/dashboard/settings'
                      className='mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1DB954] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1ed760]'
                    >
                      <Icon
                        name='Music'
                        className='h-4 w-4'
                        aria-hidden='true'
                      />
                      Connect Spotify
                    </Link>
                  </>
                )}
              </div>
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
                  {rows.map((release, index) => {
                    const manualOverrideCount = release.providers.filter(
                      provider => provider.source === 'manual'
                    ).length;

                    return (
                      <tr
                        key={release.slug}
                        className={cn(
                          'group transition-colors duration-200 hover:bg-surface-2/50',
                          index !== rows.length - 1 && 'border-b border-subtle'
                        )}
                      >
                        {/* Release info cell */}
                        <td className='px-4 py-4 align-middle sm:px-6'>
                          <div className='flex items-center gap-3'>
                            {/* Artwork thumbnail */}
                            <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm'>
                              {release.artworkUrl ? (
                                <Image
                                  src={release.artworkUrl}
                                  alt={`${release.title} artwork`}
                                  fill
                                  className='object-cover'
                                  sizes='48px'
                                />
                              ) : (
                                <div className='flex h-full w-full items-center justify-center'>
                                  <Icon
                                    name='Disc3'
                                    className='h-6 w-6 text-tertiary-token'
                                    aria-hidden='true'
                                  />
                                </div>
                              )}
                            </div>
                            {/* Title and metadata */}
                            <div className='min-w-0 flex-1'>
                              <div className='flex items-center gap-2'>
                                <span className='truncate text-sm font-semibold text-primary-token'>
                                  {release.title}
                                </span>
                                {manualOverrideCount > 0 && (
                                  <Badge
                                    variant='secondary'
                                    className='shrink-0 border border-amber-200 bg-amber-50 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
                                  >
                                    {manualOverrideCount} edited
                                  </Badge>
                                )}
                              </div>
                              <p className='mt-0.5 text-xs text-secondary-token'>
                                {release.releaseDate
                                  ? new Date(
                                      release.releaseDate
                                    ).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                    })
                                  : 'Release date TBD'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Smart link cell */}
                        <td className='px-4 py-4 align-middle sm:px-6'>
                          <Button
                            variant='secondary'
                            size='sm'
                            data-testid={`smart-link-copy-${release.id}`}
                            data-url={`${getBaseUrl()}${release.smartLinkPath}`}
                            onClick={() =>
                              void handleCopy(
                                release.smartLinkPath,
                                `${release.title} smart link`,
                                `smart-link-copy-${release.id}`
                              )
                            }
                            className='inline-flex items-center gap-2 text-xs'
                          >
                            <Icon
                              name='Link'
                              className='h-3.5 w-3.5'
                              aria-hidden='true'
                            />
                            Copy link
                          </Button>
                        </td>

                        {/* Provider cells */}
                        {primaryProviders.map(providerKey => {
                          const provider = release.providers.find(
                            item => item.key === providerKey
                          );
                          const available = Boolean(provider?.url);
                          const isManual = provider?.source === 'manual';
                          const testId = `provider-copy-${release.id}-${providerKey}`;
                          const status = isManual
                            ? 'manual'
                            : available
                              ? 'available'
                              : 'missing';

                          return (
                            <td
                              key={providerKey}
                              className='px-4 py-4 align-middle sm:px-6'
                            >
                              <div className='flex items-center gap-3'>
                                <ProviderStatusDot
                                  status={status}
                                  accent={providerConfig[providerKey].accent}
                                />
                                {available ? (
                                  <button
                                    type='button'
                                    data-testid={testId}
                                    data-url={
                                      provider?.path
                                        ? `${getBaseUrl()}${provider.path}`
                                        : undefined
                                    }
                                    onClick={() => {
                                      if (!provider?.path) return;
                                      void handleCopy(
                                        provider.path,
                                        `${release.title} – ${providerConfig[providerKey].label}`,
                                        testId
                                      );
                                    }}
                                    className='group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-secondary-token transition-colors hover:bg-surface-2 hover:text-primary-token'
                                  >
                                    <Icon
                                      name='Copy'
                                      className='h-3.5 w-3.5 opacity-0 transition-opacity group-hover/btn:opacity-100'
                                      aria-hidden='true'
                                    />
                                    <span>
                                      {isManual ? 'Custom' : 'Detected'}
                                    </span>
                                  </button>
                                ) : (
                                  <span className='text-xs text-tertiary-token'>
                                    Not found
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* Actions cell */}
                        <td className='px-4 py-4 align-middle text-right sm:px-6'>
                          <Button
                            variant='ghost'
                            size='sm'
                            className='inline-flex items-center gap-1.5 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100'
                            data-testid={`edit-links-${release.id}`}
                            onClick={() => openEditor(release)}
                          >
                            <Icon
                              name='PencilLine'
                              className='h-3.5 w-3.5'
                              aria-hidden='true'
                            />
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
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
                  const helperText =
                    existing?.source === 'manual'
                      ? 'Manual override active'
                      : existing?.url
                        ? 'Detected automatically'
                        : 'No link yet';

                  return (
                    <div
                      key={`${editingRelease.id}-${provider.key}`}
                      className='rounded-lg border border-subtle bg-surface-1 p-3 shadow-sm'
                    >
                      <div className='flex items-center justify-between gap-2'>
                        <div className='flex items-center gap-2'>
                          <span
                            className='block h-2.5 w-2.5 rounded-full'
                            style={{ backgroundColor: provider.accent }}
                            aria-hidden='true'
                          />
                          <p className='text-sm font-semibold text-primary-token'>
                            {provider.label}
                          </p>
                        </div>
                        {existing?.source === 'manual' ? (
                          <Badge
                            variant='secondary'
                            className='border border-amber-200 bg-amber-50 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
                          >
                            Manual
                          </Badge>
                        ) : null}
                      </div>
                      <p className='mt-1 text-xs text-secondary-token'>
                        {helperText}
                      </p>
                      <div className='mt-2 space-y-2'>
                        <Input
                          value={value}
                          onChange={event =>
                            setDrafts(prev => ({
                              ...prev,
                              [provider.key]: event.target.value,
                            }))
                          }
                          placeholder={`${provider.label} URL`}
                          data-testid={`provider-input-${editingRelease.id}-${provider.key}`}
                        />
                        <div className='flex items-center justify-between gap-2'>
                          <Button
                            variant='primary'
                            size='sm'
                            disabled={isSaving || !value.trim()}
                            data-testid={`save-provider-${editingRelease.id}-${provider.key}`}
                            onClick={() => handleSave(provider.key)}
                          >
                            Save
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            disabled={isSaving}
                            data-testid={`reset-provider-${editingRelease.id}-${provider.key}`}
                            onClick={() => handleReset(provider.key)}
                          >
                            Reset
                          </Button>
                        </div>
                      </div>
                    </div>
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
