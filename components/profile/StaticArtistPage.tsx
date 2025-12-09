import Link from 'next/link';
import React from 'react';
import { ArtistNotificationsCTA } from '@/components/profile/ArtistNotificationsCTA';
import { ArtistPageShell } from '@/components/profile/ArtistPageShell';
import { StaticListenInterface } from '@/components/profile/StaticListenInterface';
import VenmoTipSelector from '@/components/profile/VenmoTipSelector';
import { type AvailableDSP, DSP_CONFIGS, getAvailableDSPs } from '@/lib/dsp';
import type { PublicContact } from '@/types/contacts';
import { Artist, LegacySocialLink } from '@/types/db';

interface StaticArtistPageProps {
  mode: string;
  artist: Artist;
  socialLinks: LegacySocialLink[];
  contacts: PublicContact[];
  subtitle: string;
  showTipButton: boolean;
  showBackButton: boolean;
  showFooter?: boolean;
}

function renderContent(
  mode: string,
  artist: Artist,
  socialLinks: LegacySocialLink[]
) {
  const mapSocialPlatformToDSPKey = (platform: string): string | null => {
    const normalized = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalized.includes('spotify')) return 'spotify';
    if (normalized.includes('applemusic') || normalized === 'itunes')
      return 'apple_music';
    if (normalized.includes('youtube')) return 'youtube';
    if (normalized.includes('soundcloud')) return 'soundcloud';
    if (normalized.includes('bandcamp')) return 'bandcamp';
    if (normalized.includes('tidal')) return 'tidal';
    if (normalized.includes('deezer')) return 'deezer';
    if (normalized.includes('amazonmusic')) return 'amazon_music';
    if (normalized.includes('pandora')) return 'pandora';
    return null;
  };

  const socialDSPs: AvailableDSP[] = (() => {
    const mapped = socialLinks
      .filter(link => link.url)
      .map(link => {
        const dspKey = mapSocialPlatformToDSPKey(link.platform);
        if (!dspKey) return null;
        const config = DSP_CONFIGS[dspKey] ?? {
          name: dspKey,
          color: '#0f111a',
          textColor: '#ffffff',
          logoSvg: '',
        };
        return {
          key: dspKey,
          name: config.name,
          url: link.url,
          config,
        } satisfies AvailableDSP;
      })
      .filter(Boolean) as AvailableDSP[];

    const deduped = new Map<string, AvailableDSP>();
    mapped.forEach(item => {
      if (!deduped.has(item.key)) {
        deduped.set(item.key, item);
      }
    });
    return Array.from(deduped.values());
  })();

  const artistDSPs = getAvailableDSPs(artist);
  const mergedDSPs = (() => {
    const byKey = new Map<string, AvailableDSP>();
    [...artistDSPs, ...socialDSPs].forEach(dsp => {
      if (!byKey.has(dsp.key)) byKey.set(dsp.key, dsp);
    });
    return Array.from(byKey.values());
  })();

  switch (mode) {
    case 'listen':
      return (
        <div className='flex justify-center'>
          <StaticListenInterface
            artist={artist}
            handle={artist.handle}
            dspsOverride={mergedDSPs}
          />
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

    case 'subscribe':
      // Subscribe mode - show notification subscription form directly
      return (
        <div className='space-y-4'>
          <ArtistNotificationsCTA artist={artist} variant='button' autoOpen />
        </div>
      );

    default: // 'profile' mode
      // Only show the Listen Now / notifications CTA if the artist has streaming platforms configured
      const hasStreamingPlatforms = mergedDSPs.length > 0;

      if (!hasStreamingPlatforms) {
        return (
          <div className='space-y-4'>
            {/* Subtle placeholder matching the Listen Now button dimensions to avoid layout shift */}
            <div
              aria-hidden='true'
              className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl border border-default bg-white text-primary-token/85 shadow-md select-none'
            >
              Listen
            </div>
          </div>
        );
      }

      return (
        <div className='space-y-4'>
          <div className='flex justify-center'>
            <Link
              href={`/${artist.handle}/listen`}
              prefetch={false}
              className='inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-black px-8 py-4 text-lg font-semibold text-white shadow-lg transition-[transform,opacity,filter] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/60 focus-visible:ring-offset-2 dark:bg-white dark:text-black dark:focus-visible:ring-white/70'
              aria-label='Open Listen page with music links'
            >
              Listen now
            </Link>
          </div>
        </div>
      );
  }
}

// Static version without animations for immediate rendering
export function StaticArtistPage({
  mode,
  artist,
  socialLinks,
  contacts,
  subtitle,
  showTipButton,
  showBackButton,
  showFooter = true,
}: StaticArtistPageProps) {
  return (
    <div className='w-full'>
      <ArtistPageShell
        artist={artist}
        socialLinks={socialLinks}
        contacts={contacts}
        subtitle={subtitle}
        showSocialBar={mode !== 'listen'}
        showTipButton={showTipButton}
        showBackButton={showBackButton}
        showFooter={showFooter}
      >
        <div>{renderContent(mode, artist, socialLinks)}</div>
      </ArtistPageShell>
    </div>
  );
}
