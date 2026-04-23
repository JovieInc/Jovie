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
import { formatReleaseDateShort } from '@/lib/discography/formatting';
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
      <DialogTitle className='flex items-center gap-2.5 text-lg font-[590] text-primary-token'>
        <Icon
          name='Link'
          className='h-4.5 w-4.5 text-secondary-token'
          aria-hidden='true'
        />
        Edit release links
      </DialogTitle>
      <DialogDescription className='text-[13px] text-secondary-token'>
        Swap in a preferred DSP link or revert back to our detected URL. All
        changes are live for your smart link immediately.
      </DialogDescription>
      <DialogBody className='space-y-3'>
        {release ? (
          <div className='space-y-3'>
            {/* Release info header */}
            <DrawerSurfaceCard
              variant='card'
              className='rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-3.5'
            >
              <EntityHeaderCard
                image={
                  <div className='relative h-16 w-16 shrink-0 overflow-hidden rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'>
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
                    className='rounded-[6px] border border-(--linear-app-frame-seam) bg-surface-1 px-2 py-0.5 text-[11px] text-secondary-token'
                  >
                    {release.releaseDate
                      ? formatReleaseDateShort(release.releaseDate)
                      : 'Date TBD'}
                  </Badge>
                }
              />
            </DrawerSurfaceCard>

            {/* Provider inputs grid */}
            <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
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
                    variant='card'
                    className='rounded-[10px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-2.5'
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <ProviderIcon
                          provider={provider.key}
                          className='h-4 w-4'
                          aria-hidden='true'
                        />
                        <p className='text-[13px] font-[510] text-primary-token'>
                          {provider.label}
                        </p>
                      </div>
                      {existing?.source === 'manual' ? (
                        <Badge
                          variant='secondary'
                          className='rounded-[6px] border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-3xs text-amber-700 dark:text-amber-300'
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
                        className='h-8 rounded-[8px] border-subtle bg-surface-0 text-[12px]'
                      />
                      <div className='flex items-center justify-between gap-2'>
                        <DrawerButton
                          tone='primary'
                          disabled={isSaving || !value.trim()}
                          data-testid={`save-provider-${release.id}-${provider.key}`}
                          className='h-7 rounded-[8px] px-2.5 text-[11px]'
                          onClick={() => onSave(provider.key)}
                        >
                          Save
                        </DrawerButton>
                        <DrawerButton
                          tone='ghost'
                          disabled={isSaving}
                          data-testid={`reset-provider-${release.id}-${provider.key}`}
                          className='h-7 rounded-[8px] px-2.5 text-[11px]'
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
      <DialogActions className='justify-end border-t border-(--linear-app-frame-seam) pt-4'>
        <DrawerButton
          onClick={onClose}
          className='h-7 rounded-[8px] px-2.5 text-[11px]'
        >
          Done
        </DrawerButton>
      </DialogActions>
    </Dialog>
  );
}
