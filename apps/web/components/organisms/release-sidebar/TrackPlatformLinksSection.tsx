'use client';

import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { DrawerLinkSection } from '@/components/molecules/drawer';
import { buildDspFindUrl, DspQuietRow } from '@/components/molecules/inspector';
import { BASE_URL } from '@/constants/domains';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import type { ProviderKey } from '@/lib/discography/types';
import { buildDestinationJovieLink } from '@/lib/links/destination-links';

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
  /**
   * The sidebar's track. When present, rows get the full destination
   * treatment: hover preview card, 'Copy Jovie link with UTM', and the
   * find query derived from the track title.
   */
  readonly track?: {
    readonly id: string;
    readonly title: string;
    readonly durationMs: number | null;
    readonly smartLinkPath: string;
  };
}

export function TrackPlatformLinksSection({
  providers,
  missingProviders = [],
  findQuery,
  title = 'DSPs',
  emptyMessage = 'No DSP links available for this track.',
  track,
}: TrackPlatformLinksSectionProps) {
  const isEmpty = providers.length === 0 && missingProviders.length === 0;
  const effectiveFindQuery = findQuery ?? track?.title;

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
            entity={
              track
                ? {
                    kind: 'track' as const,
                    id: track.id,
                    label: track.title,
                    durationSec:
                      track.durationMs != null
                        ? Math.round(track.durationMs / 1000)
                        : undefined,
                  }
                : undefined
            }
            jovieLinkUrl={
              track
                ? buildDestinationJovieLink({
                    baseUrl: BASE_URL,
                    linkPath: track.smartLinkPath,
                    destinationKey: provider.key,
                    surface: 'track-sidebar',
                  })
                : undefined
            }
          />
        ))}
        {missingProviders.map(provider => {
          const label =
            PROVIDER_LABELS[provider.key] ?? provider.label ?? provider.key;
          const findUrl = effectiveFindQuery
            ? buildDspFindUrl(provider.key, effectiveFindQuery)
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
