'use client';

/**
 * SoundsLandingPage Component
 *
 * A public-facing landing page for the "Use this sound" feature.
 * Shows release artwork, title, artist, and buttons to use the sound
 * on short-form video platforms (TikTok, Instagram Reels, YouTube Shorts).
 *
 * Tracks individual button clicks via /api/track using sendBeacon.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useCallback } from 'react';
import { VIDEO_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import type { VideoProviderKey } from '@/lib/discography/types';
import { appendUTMParamsToUrl, type PartialUTMParams } from '@/lib/utm';

export interface VideoProvider {
  key: VideoProviderKey;
  label: string;
  cta: string;
  accent: string;
  url: string;
}

interface SoundsLandingPageProps {
  readonly release: {
    readonly title: string;
    readonly artworkUrl: string | null;
  };
  readonly artist: {
    readonly name: string;
    readonly handle: string | null;
  };
  readonly videoProviders: VideoProvider[];
  /** Smart link path back to the main release page */
  readonly smartLinkPath: string;
  /** UTM params captured from incoming request and passed to outbound links */
  readonly utmParams?: PartialUTMParams;
  /** Tracking context for click analytics */
  readonly tracking?: {
    readonly contentType: 'release' | 'track';
    readonly contentId: string;
    readonly smartLinkSlug?: string | null;
  };
}

export function SoundsLandingPage({
  release,
  artist,
  videoProviders,
  smartLinkPath,
  utmParams = {},
  tracking,
}: Readonly<SoundsLandingPageProps>) {
  const handleProviderClick = useCallback(
    (providerKey: VideoProviderKey) => {
      if (!artist.handle || !tracking?.contentId || !tracking?.contentType)
        return;

      const payload = {
        handle: artist.handle,
        linkType: 'listen',
        target: providerKey,
        source: 'link',
        context: {
          contentType: tracking.contentType,
          contentId: tracking.contentId,
          provider: providerKey,
          smartLinkSlug: tracking.smartLinkSlug ?? undefined,
        },
      };

      const body = JSON.stringify(payload);

      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/track', blob);
        return;
      }

      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // Ignore tracking errors — don't block the user
      });
    },
    [artist.handle, tracking]
  );

  return (
    <div className='h-dvh bg-base text-foreground'>
      {/* Ambient glow */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='bg-foreground/5 absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px]' />
      </div>

      <main
        id='main-content'
        className='relative z-10 flex h-full flex-col items-center px-6 pt-10'
      >
        <div className='flex w-full max-w-[272px] min-h-0 flex-1 flex-col'>
          {/* Artwork */}
          <div className='shrink-0'>
            <div className='relative aspect-square w-full overflow-hidden rounded-lg bg-surface-1/30 shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]'>
              {release.artworkUrl ? (
                <Image
                  src={release.artworkUrl}
                  alt={`${release.title} artwork`}
                  fill
                  className='object-cover'
                  sizes='272px'
                  priority
                />
              ) : (
                <div className='flex h-full w-full items-center justify-center'>
                  <Icon
                    name='Disc3'
                    className='text-muted-foreground h-16 w-16'
                    aria-hidden='true'
                  />
                </div>
              )}
            </div>

            {/* Release Info */}
            <div className='mt-4 text-center'>
              <p className='text-muted-foreground text-[11px] font-medium uppercase tracking-widest'>
                Use this sound
              </p>
              <h1 className='mt-1.5 text-[17px] font-semibold leading-snug tracking-tight'>
                {release.title}
              </h1>
              {artist.handle ? (
                <Link
                  href={`/${artist.handle}`}
                  className='text-muted-foreground hover:text-foreground/70 mt-1 block text-[13px] transition-colors'
                >
                  {artist.name}
                </Link>
              ) : (
                <p className='text-muted-foreground mt-1 text-[13px]'>
                  {artist.name}
                </p>
              )}
            </div>
          </div>

          {/* Video Platform Buttons */}
          <div className='mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
            <div className='space-y-2 py-1'>
              {videoProviders.map(provider => {
                const logoConfig = VIDEO_LOGO_CONFIG[provider.key];

                return (
                  <SmartLinkProviderButton
                    key={provider.key}
                    href={appendUTMParamsToUrl(provider.url, utmParams)}
                    onClick={() => handleProviderClick(provider.key)}
                    label={provider.cta}
                    iconPath={logoConfig?.iconPath}
                    className='bg-gradient-to-r from-pink-500/[0.08] to-violet-500/[0.08] hover:from-pink-500/[0.14] hover:to-violet-500/[0.14]'
                  />
                );
              })}
            </div>

            {/* Back to streaming links */}
            <div className='mt-3 text-center'>
              <Link
                href={appendUTMParamsToUrl(smartLinkPath, utmParams)}
                className='text-muted-foreground hover:text-foreground/90 inline-flex items-center gap-1.5 text-[12px] transition-colors'
              >
                <Icon
                  name='Headphones'
                  className='h-3.5 w-3.5'
                  aria-hidden='true'
                />
                <span>Listen on streaming platforms</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Jovie Branding */}
        <footer className='shrink-0 pb-5 pt-3 text-center'>
          <Link
            href='/'
            className='text-muted-foreground/70 hover:text-foreground/90 inline-flex items-center gap-1 text-2xs uppercase tracking-widest transition-colors'
          >
            <span>Powered by</span>
            <span className='font-semibold'>Jovie</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
