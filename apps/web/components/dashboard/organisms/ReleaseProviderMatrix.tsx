'use client';

import { Button } from '@jovie/ui';
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
  ReleaseEditDialog,
  ReleaseTableRow,
} from '@/components/dashboard/organisms/releases';
import { copyToClipboard } from '@/hooks/useClipboard';
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
                        className={cn(
                          'h-4 w-4',
                          isSyncing && 'animate-spin motion-reduce:animate-none'
                        )}
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
