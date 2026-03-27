'use client';

/**
 * ReleaseDspLinks Component
 *
 * DSP links section with add/remove functionality
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
  SidebarLinkRow,
} from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import type { ProviderKey } from '@/lib/discography/types';
import { cn } from '@/lib/utils';

import type { Release } from './types';
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
  readonly onSetIsAddingLink: (value: boolean) => void;
  readonly onSetNewLinkUrl: (value: string) => void;
  readonly onSetSelectedProvider: (value: ProviderKey | null) => void;
  readonly onAddLink: () => Promise<void>;
  readonly onRemoveLink: (provider: ProviderKey) => Promise<void>;
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
  onSetIsAddingLink,
  onSetNewLinkUrl,
  onSetSelectedProvider,
  onAddLink,
  onRemoveLink,
  onNewLinkKeyDown,
  showHeading = false,
}: ReleaseDspLinksProps) {
  // Get list of providers that don't have links yet (for the add dropdown)
  const providerKeys = Object.keys(providerConfig) as ProviderKey[];
  const availableProviders = providerKeys
    .filter(key => !release.providers.some(p => p.key === key))
    .map(key => [key, providerConfig[key]] as const);

  return (
    <DrawerLinkSection
      title='Platforms'
      showHeading={showHeading}
      isEmpty={release.providers.length === 0 && !isAddingLink}
      emptyMessage='No platform links yet.'
    >
      {/* Providers list */}
      {release.providers.length > 0 && (
        <div className='space-y-1.5'>
          {release.providers.map(provider => {
            const config = providerConfig[provider.key];
            const isManual = provider.source === 'manual';

            return (
              <SidebarLinkRow
                key={provider.key}
                icon={
                  <ProviderIcon
                    provider={provider.key}
                    className='h-4 w-4'
                    aria-label={config?.label || provider.key}
                  />
                }
                label={config?.label || provider.key}
                url={provider.url}
                deepLinkPlatform={provider.key}
                badge={isManual ? 'Custom' : undefined}
                isEditable={isEditable}
                isRemoving={isRemovingDspLink === provider.key}
                onRemove={() => void onRemoveLink(provider.key)}
              />
            );
          })}
        </div>
      )}

      {/* Add link form */}
      {isEditable && isAddingLink && (
        <DrawerSurfaceCard
          className={cn(LINEAR_SURFACE.drawerCardSm, 'mt-1.5 space-y-2.5 p-3')}
        >
          <DrawerFormGridRow label='Provider'>
            <Select
              value={selectedProvider ?? ''}
              onValueChange={(value: string) => {
                if (value in providerConfig) {
                  onSetSelectedProvider(value as ProviderKey);
                }
              }}
            >
              <SelectTrigger className='h-[30px] w-full rounded-md border-subtle bg-surface-0 text-[12px]'>
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
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                onSetNewLinkUrl(event.target.value)
              }
              onKeyDown={onNewLinkKeyDown}
              placeholder='https://open.spotify.com/...'
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoFocus
              className='h-8 rounded-md border-subtle bg-surface-0 text-[12px]'
            />
          </DrawerFormGridRow>
          <div className='flex justify-end gap-2 border-t border-(--linear-app-frame-seam) pt-2'>
            <DrawerButton
              type='button'
              onClick={() => {
                onSetIsAddingLink(false);
                onSetNewLinkUrl('');
                onSetSelectedProvider(null);
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
              className='min-w-[68px]'
            >
              {isAddingDspLink ? 'Adding...' : 'Add'}
            </DrawerButton>
          </div>
        </DrawerSurfaceCard>
      )}
    </DrawerLinkSection>
  );
}
