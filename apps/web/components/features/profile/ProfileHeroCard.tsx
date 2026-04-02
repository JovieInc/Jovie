'use client';

import { Bell, Play, Ticket } from 'lucide-react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialLink } from '@/components/molecules/SocialLink';
import type { Artist, LegacySocialLink } from '@/types/db';

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
  readonly primaryAction?: {
    readonly label: string;
    readonly href?: string | null;
    readonly external?: boolean;
    readonly onClick?: () => void;
    readonly ariaLabel?: string;
  } | null;
  readonly onPlayClick: () => void;
  readonly onBellClick: () => void;
  readonly spotlightLabel?: string | null;
  readonly spotlightValue?: string | null;
  readonly primaryActionKind?: 'tickets' | 'listen' | 'subscribe';
  readonly socialLinks?: LegacySocialLink[];
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
  spotlightLabel,
  spotlightValue,
  primaryActionKind = 'listen',
  socialLinks = [],
}: ArtistHeroProps) {
  const eyebrow = getReleaseEyebrow(latestRelease);
  const primaryActionClassName =
    'inline-flex min-h-12 items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-[590] text-black shadow-[0_18px_45px_rgba(0,0,0,0.34)] transition-[transform,opacity] duration-200 hover:opacity-92 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

  return (
    <section className='relative h-[48dvh] min-h-[420px] max-h-[620px] w-full overflow-hidden md:h-[56dvh] md:min-h-[520px] md:rounded-t-[30px]'>
      <div className='absolute inset-0'>
        <ImageWithFallback
          src={heroImageUrl ?? artist.image_url}
          alt={artist.name}
          fill
          priority={true}
          sizes='(max-width: 767px) 100vw, (max-width: 1280px) 46vw, 620px'
          className='object-cover object-center md:scale-[1.02]'
          fallbackVariant='avatar'
          fallbackClassName='bg-surface-2'
        />
      </div>

      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.22),transparent_30%),linear-gradient(180deg,rgba(4,6,10,0.06)_0%,rgba(5,7,12,0.18)_30%,rgba(7,8,10,0.82)_76%,rgba(7,8,10,0.98)_100%)]' />
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_48%,rgba(6,7,10,0.6)_68%,rgba(5,6,8,0.96)_100%)]' />

      <div className='relative flex h-full flex-col justify-between px-5 pb-6 pt-[max(env(safe-area-inset-top),1rem)] md:px-7 md:pb-8 md:pt-6'>
        <div className='flex justify-between gap-3'>
          <div className='flex items-start gap-2'>
            {spotlightLabel && spotlightValue ? (
              <div className='rounded-full border border-white/12 bg-black/20 px-3 py-1.5 backdrop-blur-md'>
                <p className='text-[0.65rem] font-[590] uppercase tracking-[0.18em] text-white/52'>
                  {spotlightLabel}
                </p>
                <p className='mt-0.5 text-xs font-[590] text-white/90 md:text-sm'>
                  {spotlightValue}
                </p>
              </div>
            ) : null}
          </div>

          <div className='flex items-center gap-2'>
            {socialLinks.map(link => (
              <SocialLink
                key={link.id}
                link={link}
                handle={artist.handle}
                artistName={artist.name}
              />
            ))}
            <button
              type='button'
              onClick={onBellClick}
              className='inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-white/12 bg-black/20 px-4 text-sm font-[590] text-white/88 backdrop-blur-md transition-[background-color,border-color,color] hover:border-white/20 hover:bg-black/28 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
              aria-label={`Get notified about ${artist.name}`}
            >
              <Bell className='h-4 w-4' aria-hidden='true' />
              <span className='sr-only md:not-sr-only md:inline'>Notify</span>
            </button>
          </div>
        </div>

        <div className='mt-auto max-w-[32rem] space-y-4 md:space-y-5'>
          <div className='space-y-2'>
            {eyebrow ? (
              <p className='text-[0.72rem] font-[590] uppercase tracking-[0.18em] text-white/58'>
                {eyebrow}
              </p>
            ) : null}

            <h1 className='line-clamp-3 max-w-[20rem] text-[2.4rem] font-[680] tracking-[-0.05em] text-white md:max-w-[30rem] md:text-[3.8rem] md:leading-[0.94]'>
              {artist.name}
            </h1>
          </div>

          <div className='flex flex-wrap items-center gap-3'>
            <button
              type='button'
              onClick={onPlayClick}
              className='inline-flex min-h-12 items-center justify-center rounded-full border border-white/12 bg-white/8 px-5 py-3 text-sm font-[590] text-white/90 backdrop-blur-md transition-[background-color,border-color,color] hover:border-white/20 hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
              aria-label={`Listen to ${artist.name}`}
            >
              <Play className='mr-2 h-4 w-4 fill-current' aria-hidden='true' />
              Play
            </button>

            {primaryAction ? (
              primaryAction.href ? (
                <a
                  href={primaryAction.href}
                  target={primaryAction.external ? '_blank' : undefined}
                  rel={
                    primaryAction.external ? 'noopener noreferrer' : undefined
                  }
                  onClick={
                    primaryAction.external ? undefined : primaryAction.onClick
                  }
                  aria-label={primaryAction.ariaLabel ?? primaryAction.label}
                  className={primaryActionClassName}
                >
                  {primaryActionKind === 'tickets' ? (
                    <Ticket className='mr-2 h-4 w-4' aria-hidden='true' />
                  ) : null}
                  {primaryAction.label}
                </a>
              ) : (
                <button
                  type='button'
                  onClick={primaryAction.onClick}
                  aria-label={primaryAction.ariaLabel ?? primaryAction.label}
                  className={primaryActionClassName}
                >
                  {primaryActionKind === 'tickets' ? (
                    <Ticket className='mr-2 h-4 w-4' aria-hidden='true' />
                  ) : null}
                  {primaryAction.label}
                </button>
              )
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use ArtistHero instead */
export const ProfileHeroCard = ArtistHero;
