'use client';

/**
 * SoundsLandingPage Component
 *
 * A public-facing landing page for the "Use this sound" feature.
 * Shows release artwork, title, artist, and buttons to use the sound
 * on short-form video platforms (TikTok, Instagram Reels, YouTube Shorts).
 */

import Image from 'next/image';
import Link from 'next/link';
import { VIDEO_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import type { VideoProviderKey } from '@/lib/discography/types';
import { getContrastSafeIconColor } from '@/lib/utils/color';

interface VideoProvider {
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
}

export function SoundsLandingPage({
  release,
  artist,
  videoProviders,
  smartLinkPath,
}: Readonly<SoundsLandingPageProps>) {
  return (
    <div className='h-dvh bg-black text-white'>
      {/* Ambient glow */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-[120px]' />
      </div>

      <main className='relative z-10 flex h-full flex-col items-center px-6 pt-10'>
        <div className='flex w-full max-w-[272px] min-h-0 flex-1 flex-col'>
          {/* Artwork */}
          <div className='shrink-0'>
            <div className='relative aspect-square w-full overflow-hidden rounded-lg bg-white/[0.04] shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]'>
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
                    className='h-16 w-16 text-white/20'
                    aria-hidden='true'
                  />
                </div>
              )}
            </div>

            {/* Release Info */}
            <div className='mt-4 text-center'>
              <p className='text-[11px] font-medium uppercase tracking-widest text-white/40'>
                Use this sound
              </p>
              <h1 className='mt-1.5 text-[17px] font-semibold leading-snug tracking-tight'>
                {release.title}
              </h1>
              {artist.handle ? (
                <Link
                  href={`/${artist.handle}`}
                  className='mt-1 block text-[13px] text-white/50 transition-colors hover:text-white/70'
                >
                  {artist.name}
                </Link>
              ) : (
                <p className='mt-1 text-[13px] text-white/50'>{artist.name}</p>
              )}
            </div>
          </div>

          {/* Video Platform Buttons */}
          <div className='mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
            <div className='space-y-2 pb-2'>
              {videoProviders.map(provider => {
                const logoConfig = VIDEO_LOGO_CONFIG[provider.key];
                const brandHover = logoConfig
                  ? getContrastSafeIconColor(logoConfig.color, true)
                  : '#ffffff';

                return (
                  <a
                    key={provider.key}
                    href={provider.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='group flex w-full items-center gap-3.5 rounded-xl bg-gradient-to-r from-pink-500/[0.08] to-violet-500/[0.08] px-4 py-3 ring-1 ring-inset ring-white/[0.10] backdrop-blur-sm transition-all duration-150 ease-out hover:-translate-y-px hover:from-pink-500/[0.14] hover:to-violet-500/[0.14] hover:ring-white/[0.16]'
                    style={
                      { '--brand-hover': brandHover } as React.CSSProperties
                    }
                  >
                    {logoConfig && (
                      <svg
                        viewBox='0 0 24 24'
                        fill='currentColor'
                        className='h-5 w-5 shrink-0 text-white/70 transition-colors duration-150 group-hover:text-[var(--brand-hover)]'
                        aria-hidden='true'
                      >
                        <path d={logoConfig.iconPath} />
                      </svg>
                    )}
                    <span className='flex-1 text-[15px] font-semibold text-white/90'>
                      {provider.cta}
                    </span>
                    <Icon
                      name='ExternalLink'
                      className='h-4 w-4 text-white/25 transition-all duration-150 group-hover:text-white/40'
                      aria-hidden='true'
                    />
                  </a>
                );
              })}
            </div>

            {/* Back to streaming links */}
            <div className='mt-3 text-center'>
              <Link
                href={smartLinkPath}
                className='inline-flex items-center gap-1.5 text-[12px] text-white/35 transition-colors hover:text-white/55'
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
            className='inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/20 transition-colors hover:text-white/35'
          >
            <span>Powered by</span>
            <span className='font-semibold'>Jovie</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
