'use client';

import { Badge, Button, Input } from '@jovie/ui';
import Image from 'next/image';
import { useMemo, useRef, useState, useTransition, useEffect } from 'react';
import { toast } from 'sonner';
import {
  resetProviderOverride,
  saveProviderOverride,
} from '@/app/app/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface ReleaseProviderMatrixProps {
  releases: ReleaseViewModel[];
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  primaryProviders: ProviderKey[];
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
  size = 'sm',
}: {
  status: 'available' | 'manual' | 'missing';
  accent: string;
  size?: 'sm' | 'md';
}) {
  const sizeClasses = size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5';
  const innerSize = size === 'md' ? 'h-1.5 w-1.5' : 'h-1 w-1';

  if (status === 'missing') {
    return (
      <span
        className={cn(
          'flex items-center justify-center rounded-full border border-subtle bg-surface-2',
          sizeClasses
        )}
      >
        <span className={cn('rounded-full bg-tertiary-token', innerSize)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative flex items-center justify-center rounded-full transition-transform duration-150',
        status === 'manual' && 'ring-2 ring-amber-400/30',
        sizeClasses
      )}
      style={{ backgroundColor: accent }}
    >
      {status === 'manual' && (
        <span className='absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-500' />
      )}
    </span>
  );
}

// Mobile release card component with Linear-style aesthetics
function ReleaseCard({
  release,
  providerConfig,
  primaryProviders,
  onCopy,
  onEdit,
}: {
  release: ReleaseViewModel;
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  primaryProviders: ProviderKey[];
  onCopy: (path: string, label: string, testId: string) => Promise<string>;
  onEdit: (release: ReleaseViewModel) => void;
}) {
  const [isPressed, setIsPressed] = useState(false);
  const manualOverrideCount = release.providers.filter(
    p => p.source === 'manual'
  ).length;

  return (
    <div
      className={cn(
        'group relative rounded-2xl border border-subtle bg-surface-1/80 backdrop-blur-lg',
        'shadow-sm transition-all duration-200 ease-out',
        'hover:shadow-md hover:border-border',
        isPressed && 'scale-[0.98] shadow-none'
      )}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
    >
      {/* Card content */}
      <div className='flex gap-4 p-4'>
        {/* Artwork */}
        <div className='relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-surface-2 shadow-sm'>
          {release.artworkUrl ? (
            <Image
              src={release.artworkUrl}
              alt={`${release.title} artwork`}
              fill
              className='object-cover'
              sizes='80px'
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

        {/* Info */}
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-2'>
            <div className='min-w-0 flex-1'>
              <h3 className='truncate text-base font-semibold text-primary-token'>
                {release.title}
              </h3>
              <p className='mt-0.5 text-sm text-secondary-token'>
                {release.releaseDate
                  ? new Date(release.releaseDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Release date TBD'}
              </p>
            </div>
            {manualOverrideCount > 0 && (
              <Badge
                variant='secondary'
                className='shrink-0 border border-amber-200 bg-amber-50 text-[10px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'
              >
                {manualOverrideCount} edited
              </Badge>
            )}
          </div>

          {/* Provider status row */}
          <div className='mt-3 flex items-center gap-3'>
            {primaryProviders.map(providerKey => {
              const provider = release.providers.find(
                p => p.key === providerKey
              );
              const available = Boolean(provider?.url);
              const isManual = provider?.source === 'manual';
              const status = isManual
                ? 'manual'
                : available
                  ? 'available'
                  : 'missing';

              return (
                <button
                  key={providerKey}
                  type='button'
                  disabled={!available}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-all duration-150',
                    'min-h-[36px] min-w-[36px]',
                    available
                      ? 'active:scale-95 hover:bg-surface-2'
                      : 'cursor-not-allowed opacity-50'
                  )}
                  onClick={() => {
                    if (provider?.path) {
                      void onCopy(
                        provider.path,
                        `${release.title} – ${providerConfig[providerKey].label}`,
                        `provider-copy-${release.id}-${providerKey}`
                      );
                    }
                  }}
                  title={`${providerConfig[providerKey].label}${available ? ' – Tap to copy' : ' – Not available'}`}
                >
                  <ProviderStatusDot
                    status={status}
                    accent={providerConfig[providerKey].accent}
                    size='md'
                  />
                  <span className='text-xs text-secondary-token hidden xs:inline'>
                    {providerConfig[providerKey].label.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className='flex items-center gap-2 border-t border-subtle/50 px-4 py-3'>
        <Button
          variant='secondary'
          size='sm'
          className='flex-1 gap-2'
          data-testid={`smart-link-copy-${release.id}`}
          onClick={() =>
            void onCopy(
              release.smartLinkPath,
              `${release.title} smart link`,
              `smart-link-copy-${release.id}`
            )
          }
        >
          <Icon name='Link' className='h-4 w-4' aria-hidden='true' />
          Copy Smart Link
        </Button>
        <Button
          variant='ghost'
          size='sm'
          className='gap-1.5'
          data-testid={`edit-links-${release.id}`}
          onClick={() => onEdit(release)}
        >
          <Icon name='PencilLine' className='h-4 w-4' aria-hidden='true' />
          Edit
        </Button>
      </div>
    </div>
  );
}

export function ReleaseProviderMatrix({
  releases,
  providerConfig,
  primaryProviders,
}: ReleaseProviderMatrixProps) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ReleaseViewModel[]>(releases);
  const [editingRelease, setEditingRelease] = useState<ReleaseViewModel | null>(
    null
  );
  const [drafts, setDrafts] = useState<DraftState>({});
  const [isSaving, startSaving] = useTransition();
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

  const totalReleases = rows.length;
  const totalOverrides = rows.reduce(
    (count, release) =>
      count + release.providers.filter(p => p.source === 'manual').length,
    0
  );

  return (
    <div className='flex h-full min-h-0 flex-col' data-testid='releases-matrix'>
      {/* Header - Linear style with frosted glass */}
      <div className='shrink-0 border-b border-subtle bg-surface-1/80 backdrop-blur-xl'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-[0.12em] text-tertiary-token'>
              Discography
            </p>
            <h1 className='mt-0.5 text-xl font-semibold tracking-tight text-primary-token sm:text-2xl'>
              Releases
            </h1>
            <p className='mt-1 hidden max-w-2xl text-sm leading-6 text-secondary-token sm:block'>
              Share one smart link per release and keep provider URLs pristine.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <span className='inline-flex items-center rounded-full border border-subtle bg-surface-2/60 px-2.5 py-1 text-xs font-medium text-secondary-token backdrop-blur-sm'>
              {totalReleases} {totalReleases === 1 ? 'release' : 'releases'}
            </span>
            {totalOverrides > 0 && (
              <span className='inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200'>
                <Icon
                  name='PencilLine'
                  className='h-3 w-3'
                  aria-hidden='true'
                />
                {totalOverrides}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto' ref={tableContainerRef}>
            {rows.length === 0 ? (
              <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
                <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2/80 backdrop-blur-sm'>
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
                  Connect your distributor or add releases manually to start
                  generating smart links.
                </p>
              </div>
            ) : isMobile ? (
              /* Mobile: Card layout with Linear aesthetics */
              <div className='space-y-3 p-4'>
                {rows.map(release => (
                  <ReleaseCard
                    key={release.slug}
                    release={release}
                    providerConfig={providerConfig}
                    primaryProviders={primaryProviders}
                    onCopy={handleCopy}
                    onEdit={openEditor}
                  />
                ))}
              </div>
            ) : (
              /* Desktop: Full-width table */
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
                    'sticky top-0 z-20 bg-surface-1/80 backdrop-blur-xl',
                    headerElevated &&
                      'shadow-sm shadow-black/5 dark:shadow-black/20'
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
                          'group transition-colors duration-150 hover:bg-surface-2/50',
                          index !== rows.length - 1 && 'border-b border-subtle'
                        )}
                      >
                        {/* Release info cell */}
                        <td className='px-4 py-4 align-middle sm:px-6'>
                          <div className='flex items-center gap-3'>
                            {/* Artwork thumbnail */}
                            <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm transition-transform duration-150 group-hover:scale-105'>
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
                            className='inline-flex items-center gap-2 text-xs transition-transform duration-150 active:scale-95'
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
                                    className='group/btn inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-secondary-token transition-all duration-150 hover:bg-surface-2 hover:text-primary-token active:scale-95'
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
                            className='inline-flex items-center gap-1.5 text-xs opacity-0 transition-all duration-150 group-hover:opacity-100 focus:opacity-100 active:scale-95'
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

          {/* Footer - Linear style */}
          {rows.length > 0 && (
            <div className='sticky bottom-0 z-20 flex items-center justify-between border-t border-subtle bg-surface-1/80 px-4 py-3 text-xs text-secondary-token backdrop-blur-xl sm:px-6'>
              <span>
                {totalReleases} {totalReleases === 1 ? 'release' : 'releases'}
                {totalOverrides > 0 && (
                  <span className='ml-1.5 text-tertiary-token'>
                    ({totalOverrides} manual{' '}
                    {totalOverrides === 1 ? 'override' : 'overrides'})
                  </span>
                )}
              </span>
              <div className='hidden items-center gap-2 sm:flex'>
                <span className='text-tertiary-token'>
                  Showing {primaryProviders.length} of{' '}
                  {Object.keys(providerConfig).length} providers
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit dialog - Enhanced for mobile */}
      <Dialog open={Boolean(editingRelease)} onClose={closeEditor} size='3xl'>
        <DialogTitle className='flex items-center gap-3 text-lg font-semibold text-primary-token sm:text-xl'>
          <Icon
            name='Link'
            className='h-5 w-5 text-secondary-token'
            aria-hidden='true'
          />
          Edit release links
        </DialogTitle>
        <DialogDescription className='text-sm text-secondary-token'>
          Swap in a preferred DSP link or revert back to our detected URL.
        </DialogDescription>
        <DialogBody className='space-y-4'>
          {editingRelease ? (
            <div className='space-y-4'>
              {/* Release info header */}
              <div className='flex items-center gap-4 rounded-xl border border-subtle bg-surface-2/60 p-4 backdrop-blur-sm'>
                {/* Artwork */}
                <div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm sm:h-16 sm:w-16'>
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
                        className='h-7 w-7 text-tertiary-token sm:h-8 sm:w-8'
                        aria-hidden='true'
                      />
                    </div>
                  )}
                </div>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-base font-semibold text-primary-token'>
                    {editingRelease.title}
                  </p>
                  <p className='mt-0.5 truncate text-xs text-secondary-token'>
                    {editingRelease.smartLinkPath}
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
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
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
                      className='rounded-xl border border-subtle bg-surface-1 p-3 shadow-sm transition-shadow duration-150 hover:shadow-md'
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
                            className='transition-transform duration-150 active:scale-95'
                          >
                            Save
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            disabled={isSaving}
                            data-testid={`reset-provider-${editingRelease.id}-${provider.key}`}
                            onClick={() => handleReset(provider.key)}
                            className='transition-transform duration-150 active:scale-95'
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
          <Button
            variant='secondary'
            size='sm'
            onClick={closeEditor}
            className='transition-transform duration-150 active:scale-95'
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
