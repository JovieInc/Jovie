'use client';

import { Badge, Button, Input } from '@jovie/ui';
import Image from 'next/image';
import { Icon } from '@/components/atoms/Icon';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';

interface ProviderInfo {
  key: ProviderKey;
  label: string;
  accent: string;
  isPrimary: boolean;
}

interface ReleaseEditDialogProps {
  release: ReleaseViewModel | null;
  providerList: ProviderInfo[];
  drafts: Partial<Record<ProviderKey, string>>;
  isSaving: boolean;
  onDraftChange: (provider: ProviderKey, value: string) => void;
  onSave: (provider: ProviderKey) => void;
  onReset: (provider: ProviderKey) => void;
  onClose: () => void;
}

export function ReleaseEditDialog({
  release,
  providerList,
  drafts,
  isSaving,
  onDraftChange,
  onSave,
  onReset,
  onClose,
}: ReleaseEditDialogProps) {
  return (
    <Dialog open={Boolean(release)} onClose={onClose} size='3xl'>
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
        {release ? (
          <div className='space-y-4'>
            {/* Release info header */}
            <div className='flex items-center gap-4 rounded-xl border border-subtle bg-surface-2/60 p-4'>
              {/* Artwork */}
              <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2 shadow-sm'>
                {release.artworkUrl ? (
                  <Image
                    src={release.artworkUrl}
                    alt={`${release.title} artwork`}
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
                  {release.title}
                </p>
                <p className='mt-0.5 text-xs text-secondary-token'>
                  Smart link: {release.smartLinkPath}
                </p>
                <Badge
                  variant='secondary'
                  className='mt-2 border border-subtle bg-transparent text-xs text-secondary-token'
                >
                  {release.releaseDate
                    ? new Date(release.releaseDate).toLocaleDateString()
                    : 'Date TBD'}
                </Badge>
              </div>
            </div>

            {/* Provider inputs grid */}
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {providerList.map(provider => {
                const value = drafts[provider.key] ?? '';
                const existing = release.providers.find(
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
                    key={`${release.id}-${provider.key}`}
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
                          className='border border-(--color-warning) bg-(--color-warning-subtle) text-[10px] text-(--color-warning-foreground)'
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
                          onDraftChange(provider.key, event.target.value)
                        }
                        placeholder={`${provider.label} URL`}
                        data-testid={`provider-input-${release.id}-${provider.key}`}
                      />
                      <div className='flex items-center justify-between gap-2'>
                        <Button
                          variant='primary'
                          size='sm'
                          disabled={isSaving || !value.trim()}
                          data-testid={`save-provider-${release.id}-${provider.key}`}
                          onClick={() => onSave(provider.key)}
                        >
                          Save
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={isSaving}
                          data-testid={`reset-provider-${release.id}-${provider.key}`}
                          onClick={() => onReset(provider.key)}
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
        <Button variant='secondary' size='sm' onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}
