'use client';

/**
 * ReleaseDspLinks Component
 *
 * DSP links section with add/remove functionality
 */

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import { Plus } from 'lucide-react';
import React from 'react';

import { DspProviderIcon } from '@/components/dashboard/atoms/DspProviderIcon';
import { SidebarLinkRow } from '@/components/molecules/drawer';
import type { ProviderKey } from '@/lib/discography/types';
import type { DspProviderId } from '@/lib/dsp-enrichment/types';

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
  readonly onNewLinkKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void;
}

// Maps ProviderKey to DspProviderId for icons
const PROVIDER_TO_DSP: Record<ProviderKey, DspProviderId | null> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube_music',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: null,
  beatport: null,
};

const FORM_ROW_CLASS = 'grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2';

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
}: ReleaseDspLinksProps) {
  // Get list of providers that don't have links yet (for the add dropdown)
  const availableProviders = Object.entries(providerConfig).filter(
    ([key]) => !release.providers.some(p => p.key === key)
  ) as [ProviderKey, { label: string; accent: string }][];

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium text-secondary-token'>
          DSP Links
        </span>
        {isEditable && availableProviders.length > 0 && (
          <Button
            type='button'
            size='icon'
            variant='ghost'
            aria-label='Add DSP link'
            onClick={() => {
              onSetIsAddingLink(true);
            }}
          >
            <Plus className='h-4 w-4' />
          </Button>
        )}
      </div>

      {/* Providers list */}
      {release.providers.length > 0 && (
        <div className='space-y-0.5'>
          {release.providers.map(provider => {
            const config = providerConfig[provider.key];
            const dspId = PROVIDER_TO_DSP[provider.key];
            const isManual = provider.source === 'manual';

            const icon = dspId ? (
              <DspProviderIcon provider={dspId} size='sm' />
            ) : (
              <span
                className='h-4 w-4 rounded-full shrink-0'
                style={{ backgroundColor: config?.accent }}
              />
            );

            return (
              <SidebarLinkRow
                key={provider.key}
                icon={icon}
                label={config?.label || provider.key}
                url={provider.url}
                badge={isManual ? 'Custom' : undefined}
                isEditable={isEditable}
                isRemoving={isRemovingDspLink === provider.key}
                onRemove={() => void onRemoveLink(provider.key)}
              />
            );
          })}
        </div>
      )}

      {/* Empty states */}
      {release.providers.length === 0 &&
        (isEditable && availableProviders.length > 0 ? (
          <button
            type='button'
            onClick={() => onSetIsAddingLink(true)}
            className='w-full py-3 text-sm text-sidebar-muted hover:text-sidebar-foreground text-center border border-dashed border-sidebar-border rounded-md hover:border-sidebar-foreground/50 transition-colors'
          >
            + Add a DSP link
          </button>
        ) : (
          <p className='text-xs text-sidebar-muted py-2'>No DSP links yet.</p>
        ))}

      {isEditable && isAddingLink && (
        <div className='mt-2 space-y-2 rounded-lg border border-dashed border-sidebar-border bg-sidebar-surface p-3'>
          <div className={FORM_ROW_CLASS}>
            <Label className='text-xs text-sidebar-muted'>Provider</Label>
            <Select
              value={selectedProvider ?? ''}
              onValueChange={(value: string) =>
                onSetSelectedProvider(value as ProviderKey)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Select provider' />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <div className='flex items-center gap-2'>
                      <span
                        className='h-2 w-2 rounded-full'
                        style={{ backgroundColor: config.accent }}
                        aria-hidden='true'
                      />
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={FORM_ROW_CLASS}>
            <Label className='text-xs text-sidebar-muted'>URL</Label>
            <Input
              type='url'
              value={newLinkUrl}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                onSetNewLinkUrl(event.target.value)
              }
              onKeyDown={onNewLinkKeyDown}
              placeholder='https://open.spotify.com/...'
              inputMode='url'
              autoCapitalize='none'
              autoCorrect='off'
              autoFocus
            />
          </div>
          <div className='flex justify-end gap-2 pt-1'>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => {
                onSetIsAddingLink(false);
                onSetNewLinkUrl('');
                onSetSelectedProvider(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type='button'
              size='sm'
              variant='primary'
              onClick={() => void onAddLink()}
              disabled={
                !isValidUrl(newLinkUrl) || !selectedProvider || isAddingDspLink
              }
            >
              {isAddingDspLink ? 'Adding...' : 'Add'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
