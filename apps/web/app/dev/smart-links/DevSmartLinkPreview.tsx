'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ReleaseLandingPage } from '@/app/r/[slug]/ReleaseLandingPage';
import { UnreleasedReleaseHero } from '@/features/release/UnreleasedReleaseHero';

const MOCK_ARTWORK =
  'https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58';

const RELEASED_PROPS = {
  release: {
    title: 'Midnight Drive',
    artworkUrl: MOCK_ARTWORK,
    releaseDate: '2025-11-15',
    previewUrl: null,
  },
  artist: {
    name: 'Luna Vega',
    handle: 'lunavega',
    avatarUrl: null,
  },
  featuredArtists: [{ name: 'Kai Rivers', handle: null }],
  providers: [
    {
      key: 'spotify' as const,
      label: 'Spotify',
      accent: '#1DB954',
      url: 'https://open.spotify.com',
      confidence: 'canonical' as const,
    },
    {
      key: 'apple_music' as const,
      label: 'Apple Music',
      accent: '#FA243C',
      url: 'https://music.apple.com',
      confidence: 'canonical' as const,
    },
    {
      key: 'youtube_music' as const,
      label: 'YouTube Music',
      accent: '#FF0000',
      url: 'https://music.youtube.com',
      confidence: 'canonical' as const,
    },
    {
      key: 'soundcloud' as const,
      label: 'SoundCloud',
      accent: '#FF5500',
      url: 'https://soundcloud.com',
      confidence: 'search_fallback' as const,
    },
  ],
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
  soundsUrl: null,
};

const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 14);

const PRESAVE_PROPS = {
  release: {
    id: 'mock-release-id',
    slug: 'midnight-drive',
    title: 'Midnight Drive',
    artworkUrl: MOCK_ARTWORK,
    releaseDate: futureDate,
    trackId: null,
    hasSpotify: true,
    hasAppleMusic: true,
  },
  artist: {
    id: 'mock-artist-id',
    name: 'Luna Vega',
    handle: 'lunavega',
    avatarUrl: null,
  },
};

export function DevSmartLinkPreview() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div className='flex min-h-screen items-start justify-center gap-10 bg-neutral-950 p-8'>
        <div className='flex flex-col items-center gap-3'>
          <h2 className='text-sm font-medium text-white/50'>
            Released (Smart Link)
          </h2>
          <div className='h-[844px] w-[390px] overflow-hidden rounded-[40px] ring-1 ring-white/10'>
            <ReleaseLandingPage {...RELEASED_PROPS} />
          </div>
        </div>

        <div className='flex flex-col items-center gap-3'>
          <h2 className='text-sm font-medium text-white/50'>
            Unreleased (Presave)
          </h2>
          <div className='h-[844px] w-[390px] overflow-hidden rounded-[40px] ring-1 ring-white/10'>
            <UnreleasedReleaseHero {...PRESAVE_PROPS} />
          </div>
        </div>
      </div>
    </QueryClientProvider>
  );
}
