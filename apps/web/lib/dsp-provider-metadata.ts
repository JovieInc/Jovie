import type { DspProviderId } from '@/lib/dsp-enrichment/types';

export type DspProviderMetadataId = Extract<
  DspProviderId,
  'genius' | 'discogs' | 'allmusic'
>;

export interface DspProviderMetadata {
  readonly placeholderUrl: string;
  readonly avatarConfidence: number;
  readonly socialIcon: {
    readonly hex: string;
    readonly path: string;
  };
}

export const DSP_PROVIDER_IDS: readonly DspProviderId[] = [
  'spotify',
  'apple_music',
  'deezer',
  'youtube_music',
  'tidal',
  'soundcloud',
  'amazon_music',
  'musicbrainz',
  'genius',
  'discogs',
  'allmusic',
] as const;

export const DSP_PROVIDER_METADATA: Readonly<
  Partial<Record<DspProviderMetadataId, DspProviderMetadata>>
> = {
  genius: {
    placeholderUrl: 'https://genius.com/artists/...',
    avatarConfidence: 0.3,
    socialIcon: {
      hex: 'FFFF64',
      path: 'M12.004.462C5.391.462.029 5.824.029 12.437c0 6.614 5.362 11.976 11.975 11.976 6.614 0 11.976-5.362 11.976-11.976C23.98 5.824 18.618.462 12.004.462Zm5.29 16.39c-.665.764-1.533 1.264-2.522 1.498a7.03 7.03 0 0 1-1.688.212c-.72 0-1.41-.104-2.055-.404a4.414 4.414 0 0 1-1.598-1.137c-.45-.516-.767-1.113-.956-1.782a7.397 7.397 0 0 1-.252-1.965V8.97c0-.3.243-.543.543-.543h1.592c.3 0 .543.243.543.543v4.357c0 .428.03.847.16 1.255.15.47.41.871.8 1.17.362.278.793.392 1.253.392.513 0 .97-.15 1.356-.468.413-.34.664-.786.79-1.3.073-.293.1-.594.1-.897V8.97c0-.3.243-.543.543-.543h1.591c.3 0 .543.243.543.543v5.305c0 .728-.116 1.434-.378 2.1a4.466 4.466 0 0 1-.365.677Z',
    },
  },
  discogs: {
    placeholderUrl: 'https://www.discogs.com/artist/...',
    avatarConfidence: 0.4,
    socialIcon: {
      hex: '333333',
      path: 'M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm0 21.6a9.6 9.6 0 1 1 0-19.2 9.6 9.6 0 0 1 0 19.2zm0-16.8a7.2 7.2 0 1 0 0 14.4 7.2 7.2 0 0 0 0-14.4zm0 12a4.8 4.8 0 1 1 0-9.6 4.8 4.8 0 0 1 0 9.6zm0-7.2a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8z',
    },
  },
  allmusic: {
    placeholderUrl: 'https://www.allmusic.com/artist/...',
    avatarConfidence: 0.35,
    socialIcon: {
      hex: 'E0344B',
      path: 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8zm-2.4 4.8L7.2 14.4h2.4l.6-1.2h3.6l.6 1.2h2.4L14.4 8.4h-4.8zm2.4 2.4l1.2 2.4h-2.4l1.2-2.4z',
    },
  },
};

export const DSP_PROVIDER_PLACEHOLDERS: Readonly<
  Partial<Record<DspProviderId, string>>
> = Object.fromEntries(
  Object.entries(DSP_PROVIDER_METADATA).map(([providerId, metadata]) => [
    providerId,
    metadata.placeholderUrl,
  ])
) as Readonly<Partial<Record<DspProviderId, string>>>;

export const DSP_PROVIDER_AVATAR_CONFIDENCE: Readonly<
  Partial<Record<DspProviderId, number>>
> = Object.fromEntries(
  Object.entries(DSP_PROVIDER_METADATA).map(([providerId, metadata]) => [
    providerId,
    metadata.avatarConfidence,
  ])
) as Readonly<Partial<Record<DspProviderId, number>>>;

export const DSP_PROVIDER_SOCIAL_ICONS: Readonly<
  Partial<Record<DspProviderId, { hex: string; path: string }>>
> = Object.fromEntries(
  Object.entries(DSP_PROVIDER_METADATA).map(([providerId, metadata]) => [
    providerId,
    metadata.socialIcon,
  ])
) as Readonly<Partial<Record<DspProviderId, { hex: string; path: string }>>>;
