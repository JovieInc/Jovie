import React from 'react';
import { ArtistNotificationsCTA } from '@/components/profile/ArtistNotificationsCTA';
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
      // Only show the Listen Now / notifications CTA if the artist has streaming platforms configured
      const hasStreamingPlatforms =
        artist.spotify_url || artist.apple_music_url || artist.youtube_url;

      if (!hasStreamingPlatforms) {
        return (
          <div className='space-y-4'>
            {/* Subtle placeholder matching the Listen Now button dimensions to avoid layout shift */}
            <div
              aria-hidden='true'
              className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl border border-subtle bg-surface-1/30 text-secondary-token/60 select-none'
            >
              Listen
            </div>
          </div>
        );
      }

      return (
        <div className='space-y-4'>
          <ArtistNotificationsCTA artist={artist} variant='link' />
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
        showSocialBar={mode !== 'listen'}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
      >
        <div>{renderContent(mode, artist, socialLinks)}</div>
      </ArtistPageShell>
    </div>
  );
}
