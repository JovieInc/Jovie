'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SoundsLandingPage } from '@/app/[username]/[slug]/sounds/SoundsLandingPage';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { UnreleasedReleaseHero } from '@/features/release/UnreleasedReleaseHero';

const MOCK_ARTWORK =
  'https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58';

// Stress test: many providers + long text to verify scrolling and truncation
const ALL_PROVIDERS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'youtube',
  'soundcloud',
  'deezer',
  'tidal',
  'amazon_music',
  'bandcamp',
  'beatport',
  'pandora',
  'napster',
  'audiomack',
  'qobuz',
  'anghami',
  'boomplay',
  'iheartradio',
  'tiktok',
  'awa',
  'audius',
] as const;

const RELEASED_PROPS = {
  release: {
    title: 'Midnight Drive (Deluxe Anniversary Remastered Edition)',
    artworkUrl: MOCK_ARTWORK,
    releaseDate: '2025-11-15',
    previewUrl: null,
  },
  artist: {
    name: 'Luna Vega',
    handle: 'lunavega',
    avatarUrl: null,
  },
  featuredArtists: [
    { name: 'Kai Rivers', handle: null },
    { name: 'DJ Electronica Supreme', handle: null },
  ],
  providers: ALL_PROVIDERS.map(key => ({
    key,
    label: key,
    accent: '#888',
    url: `https://example.com/${key}`,
    confidence: 'canonical' as const,
  })),
  credits: [
    {
      role: 'producer' as const,
      label: 'Producer',
      entries: [
        {
          artistId: 'a1',
          name: 'Luna Vega',
          handle: 'lunavega',
          role: 'producer' as const,
          position: 0,
        },
      ],
    },
    {
      role: 'composer' as const,
      label: 'Composer',
      entries: [
        {
          artistId: 'a1',
          name: 'Luna Vega',
          handle: 'lunavega',
          role: 'composer' as const,
          position: 0,
        },
        {
          artistId: 'a2',
          name: 'Kai Rivers',
          handle: null,
          role: 'composer' as const,
          position: 1,
        },
      ],
    },
  ],
  soundsUrl: '/lunavega/midnight-drive/sounds',
};

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 14);

const PRESAVE_PROPS = {
  release: {
    id: 'mock-release-id',
    slug: 'midnight-drive',
    title: 'Midnight Drive (Deluxe Anniversary Remastered Edition)',
    artworkUrl: MOCK_ARTWORK,
    releaseDate: futureDate,
    trackId: null,
    hasSpotify: true,
    hasAppleMusic: true,
  },
  artist: {
    id: 'mock-artist-id',
    name: 'Luna Vega feat. Kai Rivers',
    handle: 'lunavega',
    avatarUrl: null,
  },
};

const SOUNDS_PROPS = {
  release: {
    title: 'Midnight Drive (Deluxe Anniversary Remastered Edition)',
    artworkUrl: MOCK_ARTWORK,
  },
  artist: {
    name: 'Luna Vega feat. Kai Rivers',
    handle: 'lunavega',
  },
  videoProviders: [
    {
      key: 'tiktok_sound' as const,
      label: 'TikTok',
      cta: 'Use on TikTok',
      accent: '#000000',
      url: 'https://tiktok.com',
    },
    {
      key: 'instagram_reels' as const,
      label: 'Instagram Reels',
      cta: 'Use on Instagram',
      accent: '#E1306C',
      url: 'https://instagram.com',
    },
    {
      key: 'youtube_shorts' as const,
      label: 'YouTube Shorts',
      cta: 'Use on YouTube',
      accent: '#FF0000',
      url: 'https://youtube.com',
    },
  ],
  smartLinkPath: '/lunavega/midnight-drive',
};

export function DevSmartLinkPreview() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div className='flex min-h-screen items-start justify-center gap-6 bg-neutral-950 p-6'>
        <div className='flex flex-col items-center gap-3'>
          <h2 className='text-sm font-medium text-white/50'>
            Released (Smart Link)
          </h2>
          <div
            className='w-[390px] overflow-hidden rounded-[40px] ring-1 ring-white/10'
            style={{ height: 844 }}
          >
            <div className='h-full [&_.profile-viewport]:!h-full [&_.profile-viewport]:!min-h-0'>
              <ReleaseLandingPage {...RELEASED_PROPS} />
            </div>
          </div>
        </div>

        <div className='flex flex-col items-center gap-3'>
          <h2 className='text-sm font-medium text-white/50'>
            Unreleased (Presave)
          </h2>
          <div
            className='w-[390px] overflow-hidden rounded-[40px] ring-1 ring-white/10'
            style={{ height: 844 }}
          >
            <div className='h-full [&_.profile-viewport]:!h-full [&_.profile-viewport]:!min-h-0'>
              <UnreleasedReleaseHero {...PRESAVE_PROPS} />
            </div>
          </div>
        </div>

        <div className='flex flex-col items-center gap-3'>
          <h2 className='text-sm font-medium text-white/50'>Use This Sound</h2>
          <div
            className='w-[390px] overflow-hidden rounded-[40px] ring-1 ring-white/10'
            style={{ height: 844 }}
          >
            <div className='h-full [&_.profile-viewport]:!h-full [&_.profile-viewport]:!min-h-0'>
              <SoundsLandingPage {...SOUNDS_PROPS} />
            </div>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
