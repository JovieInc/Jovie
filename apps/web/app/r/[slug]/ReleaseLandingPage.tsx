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

interface ReleaseLandingPageProps
  extends Readonly<{
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
  }> {}

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
}: Readonly<ReleaseLandingPageProps>) {
  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className='min-h-screen bg-black text-white'>
      {/* Ambient glow background */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/3 blur-3xl' />
      </div>

      <main className='relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8'>
        <div className='w-full max-w-sm space-y-5'>
          {/* Release Artwork */}
          <div className='relative aspect-square w-full overflow-hidden rounded-[20px] bg-white/5 shadow-2xl shadow-black/50 ring-1 ring-white/10'>
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='(max-width: 384px) 100vw, 384px'
                priority
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <Icon
                  name='Disc3'
                  className='h-20 w-20 text-white/20'
                  aria-hidden='true'
                />
              </div>
            )}
          </div>

          {/* Release Info */}
          <div className='text-center'>
            <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
              {release.title}
            </h1>
            <p className='mt-1.5 text-base text-white/60'>{artist.name}</p>
            {formattedDate && (
              <p className='mt-1 text-xs text-white/40'>{formattedDate}</p>
            )}
          </div>

          {/* Streaming Platform Buttons */}
          <div className='space-y-2.5'>
            {providers.map(provider => (
              <a
                key={provider.key}
                href={provider.url ?? '#'}
                target='_blank'
                rel='noopener noreferrer'
                className='group flex w-full items-center gap-3 rounded-2xl bg-white/4 px-4 py-3 ring-1 ring-inset ring-white/8 backdrop-blur-sm transition-all hover:bg-white/8 hover:ring-white/12'
              >
                <span
                  className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-lg'
                  style={{
                    background: `linear-gradient(135deg, ${provider.accent}25, ${provider.accent}10)`,
                    boxShadow: `0 4px 12px ${provider.accent}15`,
                    color: provider.accent,
                  }}
                >
                  <SocialIcon
                    platform={getIconPlatform(provider.key)}
                    className='h-5 w-5'
                  />
                </span>
                <span className='flex-1 text-left'>
                  <span className='block text-[15px] font-medium text-white/90'>
                    {provider.label}
                  </span>
                  <span className='block text-xs text-white/40'>Play</span>
                </span>
                <Icon
                  name='ChevronRight'
                  className='h-4 w-4 text-white/20 transition-transform group-hover:translate-x-0.5'
                  aria-hidden='true'
                />
              </a>
            ))}
          </div>

          {/* Empty state if no providers */}
          {providers.length === 0 && (
            <div className='rounded-2xl bg-white/4 p-6 text-center ring-1 ring-inset ring-white/8'>
              <Icon
                name='Music'
                className='mx-auto h-10 w-10 text-white/20'
                aria-hidden='true'
              />
              <p className='mt-3 text-sm text-white/40'>
                No streaming links available yet.
              </p>
            </div>
          )}

          {/* Jovie Branding */}
          <footer className='pt-6 text-center'>
            <Link
              href='/'
              className='inline-flex items-center gap-1.5 text-[11px] text-white/25 transition-colors hover:text-white/40'
            >
              <span>Powered by</span>
              <span className='font-medium'>Jovie</span>
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
