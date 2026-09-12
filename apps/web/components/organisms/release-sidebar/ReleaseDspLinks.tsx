'use client';

/**
 * Release DSP list: quiet name+↗ rows, Find when not found, no helper prose.
 */

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { type ChangeEvent, type KeyboardEvent } from 'react';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  DrawerButton,
  DrawerFormGridRow,
  DrawerLinkSection,
  DrawerSurfaceCard,
} from '@/components/molecules/drawer';
import {
  DspQuietRow,
  InfoPopover,
  OverflowMenu,
} from '@/components/molecules/inspector';
import { ReleaseActionErrorCard } from '@/components/organisms/release-sidebar/ReleaseActionErrorCard';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

import type { Release, ReleaseSidebarActionError } from './types';
import { isValidUrl } from './utils';

interface ReleaseDspLinksProps {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly isEditable: boolean;
  readonly isAddingLink: boolean;
  readonly newLinkUrl: string;
  readonly selectedProvider: ProviderKey | null;
  readonly isAddingDspLink: boolean;
  readonly isRemovingDspLink: string | null;
  readonly actionError?: ReleaseSidebarActionError | null;
  readonly onSetIsAddingLink: (value: boolean) => void;
  readonly onSetNewLinkUrl: (value: string) => void;
  readonly onSetSelectedProvider: (value: ProviderKey | null) => void;
  readonly onAddLink: () => Promise<void>;
  readonly onRemoveLink: (provider: ProviderKey) => Promise<void>;
  readonly onDismissActionError?: () => void;
  readonly onNewLinkKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly showHeading?: boolean;
}

export function ReleaseDspLinks({
  release,
  providerConfig,
  isEditable,
  isAddingLink,
  newLinkUrl,
  selectedProvider,
  isAddingDspLink,
  isRemovingDspLink,
  actionError,
  onSetIsAddingLink,
  onSetNewLinkUrl,
  onSetSelectedProvider,
  onAddLink,
  onRemoveLink,
  onDismissActionError,
  onNewLinkKeyDown,
  showHeading = false,
}: ReleaseDspLinksProps) {
  const providerKeys = Object.keys(providerConfig) as ProviderKey[];
  const availableProviders = providerKeys
    .filter(key => !release.providers.some(p => p.key === key))
    .map(key => [key, providerConfig[key]] as const);

  const unresolvedProviders = (
    release.providerCounts?.unresolvedProviders ?? []
  ).filter(key => !release.providers.some(p => p.key === key));

  const hasAnyRows =
    release.providers.length > 0 || unresolvedProviders.length > 0;

  return (
    <DrawerLinkSection
      title='DSPs'
      showHeading={showHeading}
      isEmpty={!hasAnyRows && !isAddingLink}
      emptyMessage='No DSP links yet.'
    >
      {release.providers.length > 0 ? (
        <div className='space-y-0.5'>
          {release.providers.map(provider => {
            const config = providerConfig[provider.key];
            const label = config?.label || provider.key;
            return (
              <div
                key={provider.key}
                className='flex items-center gap-1'
                data-dsp-status='linked'
                data-provider={provider.key}
              >
                <DspQuietRow
                  className='min-w-0 flex-1'
                  label={label}
                  href={provider.url}
                  icon={
                    <ProviderIcon
                      provider={provider.key}
                      className='h-4 w-4'
                      aria-label={label}
                    />
                  }
                />
                {isEditable ? (
                  <OverflowMenu
                    label={`Actions for ${label}`}
                    items={[
                      {
                        id: 'remove',
                        label: `Remove ${label}`,
                        variant: 'destructive',
                        disabled: isRemovingDspLink === provider.key,
                        onSelect: () => {
                          void onRemoveLink(provider.key);
                        },
                      },
                    ]}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {unresolvedProviders.length > 0 ? (
        <div className='space-y-0.5'>
          {unresolvedProviders.map(key => {
            const config = providerConfig[key];
            const label = config?.label || key;
            return (
              <DspQuietRow
                key={`missing-${key}`}
                label={label}
                testId={`dsp-find-${key}`}
                icon={
                  <ProviderIcon
                    provider={key}
                    className='h-4 w-4 opacity-60'
                    aria-label={label}
                  />
                }
                onFind={
                  isEditable
                    ? () => {
                        onSetSelectedProvider(key);
                        onSetIsAddingLink(true);
                        onDismissActionError?.();
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      ) : null}

      {actionError ? (
        <div role='status' aria-live='polite' className='mt-3'>
          <ReleaseActionErrorCard
            variant='card'
            title={actionError.title}
            message={actionError.message}
            actionLabel={actionError.actionLabel}
            onRetry={actionError.onRetry}
            onDismiss={onDismissActionError}
            testId='dsp-link-action-error'
          />
        </div>
      ) : null}

      {isEditable && isAddingLink ? (
        <DrawerSurfaceCard
          className={cn(LINEAR_SURFACE.drawerCardSm, 'mt-1.5 space-y-2.5 p-3')}
        >
          <div className='flex items-center justify-end'>
            <InfoPopover label='About adding a DSP link'>
              Choose a provider and paste a valid URL. The draft stays in place
              if the save fails.
            </InfoPopover>
          </div>
          <DrawerFormGridRow label='Provider'>
            <Select
              value={selectedProvider ?? ''}
              onValueChange={(value: string) => {
                if (value in providerConfig) {
                  onSetSelectedProvider(value as ProviderKey);
                  onDismissActionError?.();
                }
              }}
            >
              <SelectTrigger className='h-8 w-full rounded-md border-subtle bg-surface-0 text-xs'>
                <SelectValue placeholder='Select provider' />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map(([key, config]) => {
                  return (
                    <SelectItem key={key} value={key}>
                      <div className='flex items-center gap-2'>
                        <ProviderIcon provider={key} className='h-4 w-4' />
                        {config.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </DrawerFormGridRow>
          <DrawerFormGridRow label='URL'>
            <Input
              type='url'
              value={newLinkUrl}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                onSetNewLinkUrl(event.target.value);
                onDismissActionError?.();
              }}
              onKeyDown={onNewLinkKeyDown}
              placeholder='https://open.spotify.com/...'
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoFocus
              className='h-8 rounded-md border-subtle bg-surface-0 text-xs'
            />
          </DrawerFormGridRow>
          <div className='flex justify-end gap-2 border-t border-(--app-shell-frame-seam) pt-2'>
            <DrawerButton
              type='button'
              onClick={() => {
                onSetIsAddingLink(false);
                onSetNewLinkUrl('');
                onSetSelectedProvider(null);
                onDismissActionError?.();
              }}
              tone='ghost'
            >
              Cancel
            </DrawerButton>
            <DrawerButton
              type='button'
              onClick={() => void onAddLink()}
              disabled={
                !isValidUrl(newLinkUrl) || !selectedProvider || isAddingDspLink
              }
              className='min-w-17'
            >
              {isAddingDspLink ? 'Adding...' : 'Add'}
            </DrawerButton>
          </div>
        </DrawerSurfaceCard>
      ) : null}
    </DrawerLinkSection>
  );
}
