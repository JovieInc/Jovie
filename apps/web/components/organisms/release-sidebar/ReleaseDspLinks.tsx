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

import type {
  Release,
  ReleaseSidebarAnalytics,
  ReleaseSidebarAnalyticsState,
} from './types';
import { isValidUrl } from './utils';

const MIN_PROVIDER_BADGE_CLICKS = 25;
const POPULAR_PROVIDER_BADGE = 'Popular';

function getMedian(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex] ?? 0;
}

interface ReleaseDspLinksProps {
  readonly release: Release;
  readonly providerConfig: Record<
    ProviderKey,
    { label: string; accent: string }
  >;
  readonly analytics?: ReleaseSidebarAnalytics | null;
  readonly analyticsState?: ReleaseSidebarAnalyticsState;
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
  analytics = null,
  analyticsState = 'loading',
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
  const providerClickMap =
    analyticsState === 'ready' && analytics
      ? new Map(
          analytics.providerClicks.map(({ provider, clicks }) => [
            provider,
            clicks,
          ])
        )
      : null;
  const totalProviderClicks = providerClickMap
    ? [...providerClickMap.values()].reduce(
        (runningTotal, clicks) => runningTotal + clicks,
        0
      )
    : 0;
  const visibleProviderClicks = providerClickMap
    ? release.providers.map(provider => providerClickMap.get(provider.key) ?? 0)
    : [];
  const medianVisibleProviderClicks = getMedian(visibleProviderClicks);
  const sortedProviders = providerClickMap
    ? [...release.providers]
        .map((provider, index) => ({
          provider,
          index,
          clicks: providerClickMap.get(provider.key) ?? 0,
        }))
        .sort((left, right) => {
          if (right.clicks !== left.clicks) {
            return right.clicks - left.clicks;
          }

          return left.index - right.index;
        })
        .map(item => item.provider)
    : release.providers;

  return (
    <DrawerLinkSection
      title='DSPs'
      showHeading={showHeading}
      isEmpty={release.providers.length === 0 && !isAddingLink}
      emptyMessage='No DSP links yet.'
    >
      {/* Providers list */}
      {sortedProviders.length > 0 && (
        <div className='space-y-1.5'>
          {sortedProviders.map(provider => {
            const config = providerConfig[provider.key];
            const isManual = provider.source === 'manual';
            const clicks = providerClickMap?.get(provider.key) ?? 0;
            const isPopularProvider =
              totalProviderClicks >= MIN_PROVIDER_BADGE_CLICKS &&
              clicks > 0 &&
              clicks >= totalProviderClicks * 0.2 &&
              clicks >= Math.max(1, medianVisibleProviderClicks * 2);
            const badge = isPopularProvider
              ? POPULAR_PROVIDER_BADGE
              : isManual
                ? 'Custom'
                : undefined;

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
                badge={badge}
                isEditable={isEditable}
                isRemoving={isRemovingDspLink === provider.key}
                onRemove={() => void onRemoveLink(provider.key)}
                surfaceVariant='track'
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
