'use client';

import { Badge, Input } from '@jovie/ui';
import { Icon } from '@/components/atoms/Icon';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  DrawerButton,
  DrawerFormField,
  DrawerSurfaceCard,
  EntityHeaderCard,
} from '@/components/molecules/drawer';
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
  readonly release: ReleaseViewModel | null;
  readonly providerList: ProviderInfo[];
  readonly drafts: Partial<Record<ProviderKey, string>>;
  readonly isSaving: boolean;
  readonly onDraftChange: (provider: ProviderKey, value: string) => void;
  readonly onSave: (provider: ProviderKey) => void;
  readonly onReset: (provider: ProviderKey) => void;
  readonly onClose: () => void;
}

function getProviderHelperText(
  source: string | undefined,
  url: string | undefined
): string {
  if (source === 'manual') {
    return 'Manual override active';
  }
  if (url) {
    return 'Detected automatically';
  }
  return 'No link yet';
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
      <DialogTitle className='flex items-center gap-3 text-xl font-[590] text-(--linear-text-primary)'>
        <Icon
          name='Link'
          className='h-5 w-5 text-(--linear-text-secondary)'
          aria-hidden='true'
        />
        Edit release links
      </DialogTitle>
      <DialogDescription className='text-[13px] text-(--linear-text-secondary)'>
        Swap in a preferred DSP link or revert back to our detected URL. All
        changes are live for your smart link immediately.
      </DialogDescription>
      <DialogBody className='space-y-4'>
        {release ? (
          <div className='space-y-4'>
            {/* Release info header */}
            <DrawerSurfaceCard className='rounded-[12px] p-4'>
              <EntityHeaderCard
                image={
                  <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) shadow-none'>
                    <ImageWithFallback
                      src={release.artworkUrl}
                      alt={`${release.title} artwork`}
                      fill
                      className='object-cover'
                      sizes='64px'
                      fallbackVariant='release'
                    />
                  </div>
                }
                title={release.title}
                subtitle={`Smart link: ${release.smartLinkPath}`}
                badge={
                  <Badge
                    variant='secondary'
                    className='border border-(--linear-border-subtle) bg-transparent text-[11px] text-(--linear-text-secondary)'
                  >
                    {release.releaseDate
                      ? new Date(release.releaseDate).toLocaleDateString()
                      : 'Date TBD'}
                  </Badge>
                }
              />
            </DrawerSurfaceCard>

            {/* Provider inputs grid */}
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              {providerList.map(provider => {
                const value = drafts[provider.key] ?? '';
                const existing = release.providers.find(
                  entry => entry.key === provider.key
                );
                const helperText = getProviderHelperText(
                  existing?.source,
                  existing?.url
                );

                return (
                  <DrawerSurfaceCard
                    key={`${release.id}-${provider.key}`}
                    className='rounded-[10px] p-3 shadow-none'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <ProviderIcon
                          provider={provider.key}
                          className='h-4 w-4'
                          aria-hidden='true'
                        />
                        <p className='text-[13px] font-[510] text-(--linear-text-primary)'>
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
                    <DrawerFormField
                      label='URL'
                      helperText={helperText}
                      className='mt-2 space-y-2'
                    >
                      <Input
                        value={value}
                        onChange={event =>
                          onDraftChange(provider.key, event.target.value)
                        }
                        placeholder={`${provider.label} URL`}
                        data-testid={`provider-input-${release.id}-${provider.key}`}
                      />
                      <div className='flex items-center justify-between gap-2'>
                        <DrawerButton
                          tone='primary'
                          disabled={isSaving || !value.trim()}
                          data-testid={`save-provider-${release.id}-${provider.key}`}
                          onClick={() => onSave(provider.key)}
                        >
                          Save
                        </DrawerButton>
                        <DrawerButton
                          tone='ghost'
                          disabled={isSaving}
                          data-testid={`reset-provider-${release.id}-${provider.key}`}
                          onClick={() => onReset(provider.key)}
                        >
                          Reset
                        </DrawerButton>
                      </div>
                    </DrawerFormField>
                  </DrawerSurfaceCard>
                );
              })}
            </div>
          </div>
        ) : null}
      </DialogBody>
      <DialogActions className='justify-end'>
        <DrawerButton onClick={onClose}>Done</DrawerButton>
      </DialogActions>
    </Dialog>
  );
}
