'use client';

/**
 * ReleaseLandingPage Component
 *
 * A public-facing landing page for release smart links.
 * Shows release artwork, title, artist info, and streaming platform buttons.
 * Includes right-click context menu on artwork for downloading at multiple sizes.
 */

import Image from 'next/image';
import Link from 'next/link';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/components/release/AlbumArtworkContextMenu';
import type { ProviderKey } from '@/lib/discography/types';
import { getContrastSafeIconColor } from '@/lib/utils/color';

interface Provider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
}

interface ReleaseLandingPageProps
  extends Readonly<{
    readonly release: {
      readonly title: string;
      readonly artworkUrl: string | null;
      readonly releaseDate: string | null;
    };
    readonly artist: {
      readonly name: string;
      readonly handle: string | null;
      readonly avatarUrl: string | null;
    };
    readonly providers: Provider[];
    /** Pre-generated artwork sizes for download context menu */
    readonly artworkSizes?: Record<string, string> | null;
    /** Whether the artist allows artwork downloads on public pages */
    readonly allowDownloads?: boolean;
    /** URL to the /sounds page, shown when video provider links exist */
    readonly soundsUrl?: string | null;
  }> {}

export function ReleaseLandingPage({
  release,
  artist,
  providers,
  artworkSizes,
  allowDownloads = false,
  soundsUrl,
}: Readonly<ReleaseLandingPageProps>) {
  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const clickableProviders = providers.filter(
    (provider): provider is Provider & { url: string } => Boolean(provider.url)
  );
  const sizes = buildArtworkSizes(artworkSizes, release.artworkUrl);

  return (
    <div className='h-dvh bg-black text-white'>
      {/* Ambient glow */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-[120px]' />
      </div>

      <main className='relative z-10 flex h-full flex-col items-center px-6 pt-10'>
        {/* Content container — fills space between top padding and footer */}
        <div className='flex w-full max-w-[272px] min-h-0 flex-1 flex-col'>
          {/* Artwork + Info — pinned at top, never scrolls */}
          <div className='shrink-0'>
            {/* Release Artwork */}
            <AlbumArtworkContextMenu
              title={release.title}
              sizes={sizes}
              allowDownloads={allowDownloads}
            >
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
            </AlbumArtworkContextMenu>

            {/* Release Info */}
            <div className='mt-4 text-center'>
              <h1 className='text-[17px] font-semibold leading-snug tracking-tight'>
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
              {formattedDate && (
                <p className='mt-0.5 text-[11px] tracking-wide text-white/30'>
                  {formattedDate}
                </p>
              )}
            </div>
          </div>

          {/* Streaming Platform Buttons — scrolls independently when overflowing */}
          <div className='mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide'>
            <div className='space-y-2 pb-2'>
              {clickableProviders.map(provider => {
                const logoConfig = DSP_LOGO_CONFIG[provider.key];
                const brandHover = logoConfig
                  ? getContrastSafeIconColor(logoConfig.color, true)
                  : '#ffffff';

                return (
                  <a
                    key={provider.key}
                    href={provider.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='group flex w-full items-center gap-3.5 rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-inset ring-white/[0.08] backdrop-blur-sm transition-all duration-150 ease-out hover:-translate-y-px hover:bg-white/[0.10] hover:ring-white/[0.12]'
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
                      {logoConfig?.name ?? provider.label}
                    </span>
                    <Icon
                      name='ChevronRight'
                      className='h-4 w-4 text-white/25 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-white/40'
                      aria-hidden='true'
                    />
                  </a>
                );
              })}
            </div>

            {/* "Use this sound" CTA for short-form video platforms */}
            {soundsUrl && (
              <div className='pt-1'>
                <Link
                  href={soundsUrl}
                  className='group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/[0.10] to-violet-500/[0.10] px-4 py-3 ring-1 ring-inset ring-white/[0.10] backdrop-blur-sm transition-all duration-150 ease-out hover:-translate-y-px hover:from-pink-500/[0.18] hover:to-violet-500/[0.18] hover:ring-white/[0.16]'
                >
                  <Icon
                    name='Sparkles'
                    className='h-4 w-4 text-white/60 transition-colors group-hover:text-white/80'
                    aria-hidden='true'
                  />
                  <span className='text-[14px] font-semibold text-white/80 transition-colors group-hover:text-white/95'>
                    Use this sound
                  </span>
                </Link>
              </div>
            )}

            {/* Empty state if no providers */}
            {clickableProviders.length === 0 && (
              <div className='rounded-xl bg-white/[0.04] p-5 text-center ring-1 ring-inset ring-white/[0.06]'>
                <Icon
                  name='Music'
                  className='mx-auto h-8 w-8 text-white/20'
                  aria-hidden='true'
                />
                <p className='mt-2 text-[13px] text-white/40'>
                  No streaming links available yet.
                </p>
              </div>
            )}
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
