'use client';

import { Bell, Play } from 'lucide-react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import type { Artist } from '@/types/db';

type HeroRelease = {
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly releaseType: string;
};

interface ArtistHeroProps {
  readonly artist: Artist;
  readonly heroImageUrl?: string | null;
  readonly latestRelease?: HeroRelease | null;
  readonly primaryAction: {
    readonly label: string;
    readonly href?: string | null;
    readonly external?: boolean;
    readonly onClick?: () => void;
    readonly ariaLabel?: string;
  };
  readonly onPlayClick: () => void;
  readonly onBellClick: () => void;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
});

function getReleaseEyebrow(release: HeroRelease | null | undefined) {
  if (!release?.releaseDate) return null;

  const releaseDate = new Date(release.releaseDate);
  const now = new Date();
  const msUntilRelease = releaseDate.getTime() - now.getTime();
  const daysSinceRelease =
    (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);

  if (msUntilRelease > 0) return `Coming ${dateFormatter.format(releaseDate)}`;
  if (daysSinceRelease <= 14) return 'Out now';
  return 'Latest release';
}

export function ArtistHero({
  artist,
  heroImageUrl,
  latestRelease,
  primaryAction,
  onPlayClick,
  onBellClick,
}: ArtistHeroProps) {
  const eyebrow = getReleaseEyebrow(latestRelease);
  const primaryActionClassName =
    'inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-[0_12px_28px_rgba(0,0,0,0.28)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

  return (
    <section className='relative h-[32dvh] min-h-[260px] max-h-[320px] w-full overflow-hidden md:h-[320px]'>
      {/* Artist photo — full bleed background */}
      <div className='absolute inset-0'>
        <ImageWithFallback
          src={heroImageUrl ?? artist.image_url}
          alt={artist.name}
          fill
          priority
          sizes='(max-width: 768px) 100vw, 440px'
          className='object-cover object-[center_24%]'
          fallbackVariant='avatar'
          fallbackClassName='bg-surface-2'
        />
      </div>

      {/* Top vignette — subtle contrast for floating buttons */}
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/8 via-35% to-transparent' />

      {/* Bottom gradient — readable text zone, fades into bg-base */}
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-bg-base)] via-[var(--color-bg-base)]/68 via-28% to-transparent' />

      {/* Content overlay */}
      <div className='relative flex h-full flex-col justify-between px-4 pb-5 pt-[max(env(safe-area-inset-top),0.75rem)] md:px-5'>
        <div className='flex justify-end pt-2'>
          <CircleIconButton
            ariaLabel={`Get notified about ${artist.name}`}
            size='md'
            variant='frosted'
            onClick={onBellClick}
          >
            <Bell className='h-4 w-4' aria-hidden='true' />
          </CircleIconButton>
        </div>

        <div className='mt-auto space-y-4'>
          <div className='min-w-0 space-y-1.5'>
            {eyebrow ? (
              <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60'>
                {eyebrow}
              </p>
            ) : null}
            <h1 className='line-clamp-2 text-3xl font-[680] tracking-tight text-white'>
              {artist.name}
            </h1>
          </div>

          <div className='flex items-center gap-3'>
            <CircleIconButton
              ariaLabel={`Listen to ${artist.name}`}
              size='lg'
              variant='frosted'
              className='shrink-0'
              onClick={onPlayClick}
            >
              <Play className='h-5 w-5 fill-current' aria-hidden='true' />
            </CircleIconButton>

            {primaryAction.href ? (
              <a
                href={primaryAction.href}
                target={primaryAction.external ? '_blank' : undefined}
                rel={primaryAction.external ? 'noopener noreferrer' : undefined}
                aria-label={primaryAction.ariaLabel ?? primaryAction.label}
                className={primaryActionClassName}
              >
                {primaryAction.label}
              </a>
            ) : (
              <button
                type='button'
                onClick={primaryAction.onClick}
                aria-label={primaryAction.ariaLabel ?? primaryAction.label}
                className={primaryActionClassName}
              >
                {primaryAction.label}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use ArtistHero instead */
export const ProfileHeroCard = ArtistHero;
