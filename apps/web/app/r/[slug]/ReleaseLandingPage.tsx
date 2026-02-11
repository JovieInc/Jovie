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
import { DspLogo } from '@/components/atoms/DspLogo';
import { Icon } from '@/components/atoms/Icon';
import {
  AlbumArtworkContextMenu,
  buildArtworkSizes,
} from '@/components/release/AlbumArtworkContextMenu';
import type { ProviderKey } from '@/lib/discography/types';

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
  }> {}

export function ReleaseLandingPage({
  release,
  artist,
  providers,
  artworkSizes,
  allowDownloads = false,
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
    <div className='min-h-dvh bg-black text-white'>
      {/* Ambient glow */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 size-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.03] blur-[120px]' />
      </div>

      <main className='relative z-10 flex min-h-dvh flex-col items-center px-6'>
        <div className='min-h-6 flex-1' />

        <div className='w-full max-w-[272px]'>
          {/* Release Artwork */}
          <AlbumArtworkContextMenu
            title={release.title}
            sizes={sizes}
            allowDownloads={allowDownloads}
          >
            <div className='relative aspect-square w-full overflow-hidden rounded-2xl bg-white/[0.04] shadow-2xl shadow-black/60 ring-1 ring-white/[0.08]'>
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
                    className='size-16 text-white/20'
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

          {/* Streaming Platform Buttons */}
          <div className='mt-5 space-y-2'>
            {clickableProviders.map(provider => (
              <a
                key={provider.key}
                href={provider.url}
                target='_blank'
                rel='noopener noreferrer'
                className='group flex w-full items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-3 ring-1 ring-inset ring-white/[0.06] backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:ring-white/[0.10]'
              >
                <span className='flex-1'>
                  <DspLogo provider={provider.key} height={20} />
                </span>
                <Icon
                  name='ChevronRight'
                  className='size-3.5 text-white/20 transition-transform group-hover:translate-x-0.5'
                  aria-hidden='true'
                />
              </a>
            ))}
          </div>

          {/* Empty state if no providers */}
          {clickableProviders.length === 0 && (
            <div className='mt-5 rounded-xl bg-white/[0.04] p-5 text-center ring-1 ring-inset ring-white/[0.06]'>
              <Icon
                name='Music'
                className='mx-auto size-8 text-white/20'
                aria-hidden='true'
              />
              <p className='mt-2 text-[13px] text-white/40'>
                No streaming links available yet.
              </p>
            </div>
          )}
        </div>

        <div className='min-h-6 flex-1' />

        {/* Jovie Branding */}
        <footer className='shrink-0 pb-5 text-center'>
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
