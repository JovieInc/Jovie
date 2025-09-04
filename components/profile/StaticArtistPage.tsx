import Link from 'next/link';
import React from 'react';
import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import { StaticListenInterface } from '@/components/profile/StaticListenInterface';
import VenmoTipSelector from '@/components/profile/VenmoTipSelector';
import { Artist, LegacySocialLink } from '@/types/db';

interface StaticArtistPageProps {
  mode: string;
  artist: Artist;
  socialLinks: LegacySocialLink[];
  subtitle: string;
  showTipButton: boolean;
  showBackButton: boolean;
}

function renderContent(
  mode: string,
  artist: Artist,
  socialLinks: LegacySocialLink[]
) {
  switch (mode) {
    case 'listen':
      return (
        <div className='flex justify-center'>
          <StaticListenInterface artist={artist} handle={artist.handle} />
        </div>
      );

    case 'tip':
      // Extract Venmo link from social links
      const venmoLink =
        socialLinks.find(l => l.platform === 'venmo')?.url || null;
      const extractVenmoUsername = (url: string | null): string | null => {
        if (!url) return null;
        try {
          const u = new URL(url);
          const allowedVenmoHosts = ['venmo.com', 'www.venmo.com'];
          if (allowedVenmoHosts.includes(u.hostname)) {
            const parts = u.pathname.split('/').filter(Boolean);
            if (parts[0] === 'u' && parts[1]) return parts[1];
            if (parts[0]) return parts[0];
          }
          return null;
        } catch {
          return null;
        }
      };

      const venmoUsername = extractVenmoUsername(venmoLink);
      const AMOUNTS = [3, 5, 7];

      return (
        <div className='space-y-4' role='main' aria-labelledby='tipping-title'>
          <h1 id='tipping-title' className='sr-only'>
            Tip {artist.name}
          </h1>

          {venmoLink ? (
            <VenmoTipSelector
              venmoLink={venmoLink}
              venmoUsername={venmoUsername ?? undefined}
              amounts={AMOUNTS}
            />
          ) : (
            <div className='text-center'>
              <div className='bg-white/60 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-2xl p-8 shadow-xl shadow-black/5'>
                <p className='text-gray-600 dark:text-gray-400' role='alert'>
                  Venmo tipping is not available for this artist yet.
                </p>
              </div>
            </div>
          )}
        </div>
      );

    default: // 'profile' mode
      // Only show the Listen Now button if the artist has streaming platforms configured
      const hasStreamingPlatforms =
        artist.spotify_url || artist.apple_music_url || artist.youtube_url;

      if (!hasStreamingPlatforms) {
        return (
          <div className='space-y-4'>
            <div className='text-center p-6 bg-white/20 dark:bg-white/5 backdrop-blur-lg border border-gray-200/30 dark:border-white/10 rounded-xl'>
              <div className='w-12 h-12 mx-auto mb-3 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center'>
                <svg
                  className='w-6 h-6 text-gray-400 dark:text-gray-500'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3'
                  />
                </svg>
              </div>
              <h3 className='text-sm font-medium text-gray-900 dark:text-white mb-1'>
                Music Coming Soon
              </h3>
              <p className='text-xs text-gray-600 dark:text-gray-400'>
                Streaming links will be available here once added
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className='space-y-4'>
          <Link
            href={`/${artist.handle}?mode=listen`}
            prefetch
            className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold text-white bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-100 rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:ring-offset-2'
          >
            🎧 Listen Now
          </Link>
        </div>
      );
  }
}

// Static version without animations for immediate rendering
export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  subtitle,
  showTipButton,
  showBackButton,
}: StaticArtistPageProps) {
  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        subtitle={subtitle}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
      >
        <div>{renderContent(mode, artist, socialLinks)}</div>
      </ArtistPageShell>
    </div>
  );
}
