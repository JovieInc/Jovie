'use client';

/**
 * ReleaseLandingPage Component
 *
 * A public-facing landing page for release smart links.
 * Shows release artwork, title, artist info, and streaming platform buttons.
 */

import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { ProviderKey } from '@/lib/discography/types';

interface Provider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
}

interface ReleaseLandingPageProps {
  release: {
    title: string;
    artworkUrl: string | null;
    releaseDate: string | null;
  };
  artist: {
    name: string;
    avatarUrl: string | null;
  };
  providers: Provider[];
  slug: string;
}

/**
 * Map provider key to social icon platform name
 */
function getIconPlatform(
  providerKey: ProviderKey
):
  | 'spotify'
  | 'applemusic'
  | 'youtube'
  | 'soundcloud'
  | 'deezer'
  | 'tidal'
  | 'amazonmusic'
  | 'bandcamp'
  | 'beatport' {
  const mapping: Record<ProviderKey, string> = {
    spotify: 'spotify',
    apple_music: 'applemusic',
    youtube: 'youtube',
    soundcloud: 'soundcloud',
    deezer: 'deezer',
    tidal: 'tidal',
    amazon_music: 'amazonmusic',
    bandcamp: 'bandcamp',
    beatport: 'beatport',
  };
  return mapping[providerKey] as ReturnType<typeof getIconPlatform>;
}

export function ReleaseLandingPage({
  release,
  artist,
  providers,
  slug,
}: ReleaseLandingPageProps) {
  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div className='min-h-screen bg-black text-white'>
      {/* Background gradient */}
      <div
        className='fixed inset-0 opacity-30'
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(64, 64, 64, 0.5) 0%, transparent 50%)',
        }}
      />

      <main className='relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12'>
        <div className='w-full max-w-md space-y-8'>
          {/* Release Artwork */}
          <div className='relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-2xl bg-white/5 shadow-2xl ring-1 ring-white/10'>
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='(max-width: 320px) 100vw, 320px'
                priority
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <Icon
                  name='Disc3'
                  className='h-24 w-24 text-white/20'
                  aria-hidden='true'
                />
              </div>
            )}
          </div>

          {/* Release Info */}
          <div className='text-center'>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              {release.title}
            </h1>
            <p className='mt-2 text-lg text-white/70'>{artist.name}</p>
            {formattedDate && (
              <p className='mt-1 text-sm text-white/50'>{formattedDate}</p>
            )}
          </div>

          {/* Streaming Platform Buttons */}
          <div className='space-y-3'>
            <p className='text-center text-xs font-medium uppercase tracking-widest text-white/40'>
              Listen on
            </p>
            <div className='space-y-2'>
              {providers.map(provider => (
                <a
                  key={provider.key}
                  href={provider.url ?? '#'}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='group flex w-full items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 transition-all hover:border-white/20 hover:bg-white/10'
                  style={
                    {
                      '--provider-accent': provider.accent,
                    } as React.CSSProperties
                  }
                >
                  <span
                    className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'
                    style={{
                      backgroundColor: `${provider.accent}20`,
                      color: provider.accent,
                    }}
                  >
                    <SocialIcon
                      platform={getIconPlatform(provider.key)}
                      className='h-5 w-5'
                    />
                  </span>
                  <span className='flex-1 text-left'>
                    <span className='block text-sm font-semibold'>
                      {provider.label}
                    </span>
                    <span className='block text-xs text-white/50'>
                      Stream now
                    </span>
                  </span>
                  <Icon
                    name='ExternalLink'
                    className='h-4 w-4 text-white/30 transition-colors group-hover:text-white/60'
                    aria-hidden='true'
                  />
                </a>
              ))}
            </div>
          </div>

          {/* Empty state if no providers */}
          {providers.length === 0 && (
            <div className='rounded-xl border border-white/10 bg-white/5 p-6 text-center'>
              <Icon
                name='Music'
                className='mx-auto h-10 w-10 text-white/30'
                aria-hidden='true'
              />
              <p className='mt-3 text-sm text-white/50'>
                No streaming links available yet.
              </p>
            </div>
          )}

          {/* Jovie Branding */}
          <footer className='pt-8 text-center'>
            <Link
              href='/'
              className='inline-flex items-center gap-2 text-xs text-white/30 transition-colors hover:text-white/50'
            >
              <span>Powered by</span>
              <span className='font-semibold'>Jovie</span>
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
