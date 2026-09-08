'use client';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DrawerLinkSection } from '@/components/molecules/drawer';
import { buildDspFindUrl, DspQuietRow } from '@/components/molecules/inspector';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import type { ProviderKey } from '@/lib/discography/types';

export interface TrackPlatformLink {
  readonly key: ProviderKey;
  readonly label: string;
  readonly url: string;
}

export interface TrackMissingPlatform {
  readonly key: ProviderKey;
  readonly label?: string;
}

interface TrackPlatformLinksSectionProps {
  readonly providers: TrackPlatformLink[];
  readonly missingProviders?: readonly TrackMissingPlatform[];
  readonly findQuery?: string;
  readonly emptyMessage?: string;
  readonly title?: string;
}

export function TrackPlatformLinksSection({
  providers,
  missingProviders = [],
  findQuery,
  title = 'DSPs',
  emptyMessage = 'No DSP links available for this track.',
}: TrackPlatformLinksSectionProps) {
  const isEmpty = providers.length === 0 && missingProviders.length === 0;

  return (
    <DrawerLinkSection
      title={title}
      isEmpty={isEmpty}
      emptyMessage={emptyMessage}
      emptyStateTestId='track-platforms-empty'
    >
      <div className='space-y-0.5'>
        {providers.map(provider => (
          <DspQuietRow
            key={provider.key}
            icon={
              <ProviderIcon
                provider={provider.key}
                className='h-4 w-4'
                aria-hidden='true'
              />
            }
            label={PROVIDER_LABELS[provider.key] ?? provider.label}
            href={provider.url}
          />
        ))}
        {missingProviders.map(provider => {
          const label =
            PROVIDER_LABELS[provider.key] ?? provider.label ?? provider.key;
          const findUrl = findQuery
            ? buildDspFindUrl(provider.key, findQuery)
            : null;
          return (
            <DspQuietRow
              key={`missing-${provider.key}`}
              icon={
                <ProviderIcon
                  provider={provider.key}
                  className='h-4 w-4 opacity-60'
                  aria-hidden='true'
                />
              }
              label={label}
              onFind={
                findUrl
                  ? () => {
                      globalThis.open(findUrl, '_blank', 'noopener,noreferrer');
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </DrawerLinkSection>
  );
}
