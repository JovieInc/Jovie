'use client';

/**
 * ReleaseLandingPage Component
 *
 * A public-facing landing page for release smart links.
 * Shows release artwork, title, artist info, and streaming platform buttons.
 */

import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { SmartLinkArtwork } from '@/components/release/SmartLinkArtwork';
import { SmartLinkShell } from '@/components/release/SmartLinkShell';
import type { ProviderKey } from '@/lib/discography/types';

interface Provider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
}

interface ReleaseLandingPageProps {
  readonly release: {
    readonly title: string;
    readonly artworkUrl: string | null;
    readonly releaseDate: string | null;
  };
  readonly artist: {
    readonly name: string;
    readonly avatarUrl: string | null;
  };
  readonly providers: Provider[];
}

const PROVIDER_ICON_MAP: Record<ProviderKey, string> = {
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

export function ReleaseLandingPage({
  release,
  artist,
  providers,
}: ReleaseLandingPageProps) {
  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <SmartLinkShell>
      {/* Release Artwork */}
      <SmartLinkArtwork
        src={release.artworkUrl}
        alt={`${release.title} artwork`}
      />

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
                platform={PROVIDER_ICON_MAP[provider.key]}
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
    </SmartLinkShell>
  );
}
