'use client';

import { Badge, Button, Input } from '@jovie/ui';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  resetProviderOverride,
  saveProviderOverride,
} from '@/app/app/dashboard/releases/actions';
import { type Column, Table } from '@/components/admin/table';
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

export function ReleaseProviderMatrix({
  releases,
  providerConfig,
  primaryProviders,
}: ReleaseProviderMatrixProps) {
  const [rows, setRows] = useState<ReleaseViewModel[]>(releases);
  const [editingRelease, setEditingRelease] = useState<ReleaseViewModel | null>(
    null
  );
  const [drafts, setDrafts] = useState<DraftState>({});
  const [isSaving, startSaving] = useTransition();

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

  const columns: Column<ReleaseViewModel>[] = useMemo(
    () => [
      {
        id: 'release',
        header: 'Release',
        cell: release => {
          const manualOverrideCount = release.providers.filter(
            provider => provider.source === 'manual'
          ).length;

          return (
            <div className='flex flex-col gap-1'>
              <div className='flex items-center gap-2'>
                <span className='text-sm font-semibold text-primary-token'>
                  {release.title}
                </span>
                {manualOverrideCount > 0 ? (
                  <Badge
                    variant='secondary'
                    className='bg-amber-100/70 text-amber-900'
                  >
                    {manualOverrideCount} override
                    {manualOverrideCount > 1 ? 's' : ''}
                  </Badge>
                ) : null}
              </div>
              <p className='text-xs text-secondary-token'>
                {release.releaseDate
                  ? new Date(release.releaseDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Release date TBD'}
              </p>
            </div>
          );
        },
        width: 'w-[240px]',
      },
      {
        id: 'smartLink',
        header: 'Smart Link',
        cell: release => (
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
            className='inline-flex items-center gap-2'
          >
            <Icon name='Copy' className='h-4 w-4' aria-hidden='true' />
            Copy smart link
          </Button>
        ),
        width: 'w-[180px]',
      },
      ...primaryProviders.map(providerKey => ({
        id: providerKey,
        header: providerConfig[providerKey].label,
        cell: (release: ReleaseViewModel) => {
          const provider = release.providers.find(
            item => item.key === providerKey
          );
          const available = Boolean(provider?.url);
          const testId = `provider-copy-${release.id}-${providerKey}`;

          return (
            <div className='flex flex-col gap-2'>
              <Button
                variant='ghost'
                size='sm'
                disabled={!available}
                data-testid={testId}
                data-url={
                  provider?.path ? `${getBaseUrl()}${provider.path}` : undefined
                }
                onClick={() => {
                  if (!provider?.path) return;
                  void handleCopy(
                    provider.path,
                    `${release.title} – ${providerConfig[providerKey].label}`,
                    testId
                  );
                }}
                className='inline-flex items-center gap-1'
              >
                <Icon
                  name={available ? 'Copy' : 'AlertCircle'}
                  className='h-4 w-4'
                  aria-hidden='true'
                />
                {available ? 'Copy link' : 'Add link'}
              </Button>
              <div className='flex flex-wrap items-center gap-1 text-[11px] text-secondary-token'>
                <Badge
                  variant='secondary'
                  className={cn(
                    'border border-subtle text-[11px]',
                    provider?.source === 'manual'
                      ? 'bg-amber-50 text-amber-900'
                      : 'bg-surface-2/70'
                  )}
                >
                  {provider?.source === 'manual'
                    ? 'Manual override'
                    : available
                      ? 'Detected'
                      : 'Missing'}
                </Badge>
                {provider?.url ? (
                  <span className='truncate text-ellipsis text-secondary-token max-w-[120px]'>
                    {provider.url}
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
        width: 'w-[180px]',
      })),
      {
        id: 'edit',
        header: 'Edit',
        cell: release => (
          <Button
            variant='ghost'
            size='sm'
            className='inline-flex items-center gap-1 text-primary-token'
            data-testid={`edit-links-${release.id}`}
            onClick={() => openEditor(release)}
          >
            <Icon name='PencilLine' className='h-4 w-4' aria-hidden='true' />
            Edit links
          </Button>
        ),
        width: 'w-[120px]',
        align: 'right',
      },
    ],
    [primaryProviders, providerConfig]
  );

  return (
    <section className='space-y-4' data-testid='releases-matrix'>
      <header className='space-y-1'>
        <p className='text-sm font-semibold uppercase tracking-[0.12em] text-secondary-token'>
          Discography
        </p>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold text-primary-token'>
              Releases
            </h1>
            <p className='max-w-3xl text-sm text-secondary-token'>
              Share one smart link per release and keep provider URLs pristine.
              Copy-ready variants for each DSP make sure fans land in the right
              app every time.
            </p>
          </div>
        </div>
      </header>

      {/* Mobile scroll hint */}
      <p className='mb-2 text-xs text-secondary-token sm:hidden'>
        ← Swipe to see more →
      </p>
      <div className='overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin scrollbar-thumb-subtle scrollbar-track-transparent'>
        <div className='min-w-[700px] overflow-hidden rounded-2xl border border-subtle bg-surface-1 shadow-sm'>
          <Table
            data={rows}
            columns={columns}
            getRowId={release => release.id}
            virtualizationThreshold={50}
            rowHeight={80}
            caption='Releases with provider links'
          />
        </div>
      </div>

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
            <div className='space-y-3 rounded-xl border border-subtle bg-surface-2/60 p-4'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <p className='text-sm font-semibold text-primary-token'>
                    {editingRelease.title}
                  </p>
                  <p className='text-xs text-secondary-token'>
                    Smart link: {editingRelease.smartLinkPath}
                  </p>
                </div>
                <Badge
                  variant='secondary'
                  className='border border-subtle bg-transparent text-secondary-token'
                >
                  {editingRelease.releaseDate
                    ? new Date(editingRelease.releaseDate).toLocaleDateString()
                    : 'Date TBD'}
                </Badge>
              </div>

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
                            className='block h-2 w-2 rounded-full'
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
                            className='bg-amber-50 text-amber-900'
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
    </section>
  );
}
