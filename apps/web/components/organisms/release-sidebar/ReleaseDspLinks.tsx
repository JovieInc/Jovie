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
import { ExternalLink, Plus, X } from 'lucide-react';
import React from 'react';

import { PlatformPill } from '@/components/dashboard/atoms/PlatformPill';
import type { ProviderKey } from '@/lib/discography/types';

import type { Release } from './types';
import { isValidUrl } from './utils';

interface ReleaseDspLinksProps {
  release: Release;
  providerConfig: Record<ProviderKey, { label: string; accent: string }>;
  isEditable: boolean;
  isAddingLink: boolean;
  newLinkUrl: string;
  selectedProvider: ProviderKey | null;
  isAddingDspLink: boolean;
  isRemovingDspLink: string | null;
  onSetIsAddingLink: (value: boolean) => void;
  onSetNewLinkUrl: (value: string) => void;
  onSetSelectedProvider: (value: ProviderKey | null) => void;
  onAddLink: () => Promise<void>;
  onRemoveLink: (provider: ProviderKey) => Promise<void>;
  onNewLinkKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

const PROVIDER_ICONS: Record<ProviderKey, string> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  youtube: 'youtube',
  soundcloud: 'soundcloud',
  deezer: 'deezer',
  tidal: 'tidal',
  amazon_music: 'amazon_music',
  bandcamp: 'bandcamp',
  beatport: 'beatport',
};

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
  const hasNoLinks = release.providers.length === 0 && !isAddingLink;

  // Get list of providers that don't have links yet (for the add dropdown)
  const availableProviders = Object.entries(providerConfig).filter(
    ([key]) => !release.providers.find(p => p.key === key)
  ) as [ProviderKey, { label: string; accent: string }][];

  return (
    <div className='space-y-2 px-3 py-2'>
      <div className='flex items-center justify-between'>
        <Label className='text-xs text-sidebar-muted'>DSP Links</Label>
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

      {hasNoLinks && (
        <p className='text-xs text-sidebar-muted'>
          No DSP links yet. {isEditable ? 'Use the + button to add one.' : ''}
        </p>
      )}

      {release.providers.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {release.providers.map((provider, index) => {
            const config = providerConfig[provider.key];
            const platformIcon = PROVIDER_ICONS[provider.key] || provider.key;
            const isManual = provider.source === 'manual';

            const ariaLabel = `Open ${config?.label || provider.key} link`;

            return (
              <PlatformPill
                key={`${provider.key}-${index}`}
                platformIcon={platformIcon}
                platformName={config?.label || provider.key}
                primaryText={config?.label || provider.key}
                secondaryText={isManual ? 'Custom' : 'Detected'}
                tone={isManual ? 'default' : 'faded'}
                testId={`release-dsp-pill-${provider.key}-${index}`}
                onClick={() => {
                  window.open(provider.url, '_blank', 'noopener,noreferrer');
                }}
                trailing={
                  <div className='flex items-center gap-1'>
                    <ExternalLink
                      className='h-3.5 w-3.5 text-tertiary-token'
                      aria-hidden
                    />
                    {isEditable && (
                      <button
                        type='button'
                        className='inline-flex h-4 w-4 items-center justify-center rounded-full text-tertiary-token hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring disabled:opacity-50'
                        aria-label={`Remove ${ariaLabel}`}
                        disabled={isRemovingDspLink === provider.key}
                        onClick={event => {
                          event.preventDefault();
                          event.stopPropagation();
                          void onRemoveLink(provider.key);
                        }}
                      >
                        <X className='h-3 w-3' aria-hidden />
                      </button>
                    )}
                  </div>
                }
                className='border-sidebar-border bg-sidebar-surface text-sidebar-foreground hover:bg-sidebar-surface-hover'
              />
            );
          })}
        </div>
      )}

      {isEditable && isAddingLink && (
        <div className='mt-2 space-y-2 rounded-lg border border-dashed border-sidebar-border bg-sidebar-surface p-3'>
          <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
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
          <div className='grid grid-cols-[96px,minmax(0,1fr)] items-center gap-2'>
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
