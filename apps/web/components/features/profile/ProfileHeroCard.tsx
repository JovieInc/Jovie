'use client';

import { Bell, Check, Play, Share2, Ticket } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialLink } from '@/components/molecules/SocialLink';
import { BASE_URL } from '@/constants/app';
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
  readonly compact?: boolean;
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
  compact = false,
}: ArtistHeroProps) {
  const eyebrow = getReleaseEyebrow(latestRelease);
  const [shareSuccess, setShareSuccess] = useState(false);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleShare = useCallback(async () => {
    const profileUrl = `${BASE_URL}/${artist.handle}`;
    const shareData = { title: artist.name, url: profileUrl };

    try {
      if (typeof navigator.share === 'function') {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(profileUrl);
      }
      setShareSuccess(true);
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
      shareTimeoutRef.current = setTimeout(() => setShareSuccess(false), 2000);
    } catch (error) {
      // AbortError = user cancelled share sheet, do nothing
      if (error instanceof Error && error.name === 'AbortError') return;
      // Fallback: try clipboard if share failed for another reason
      try {
        await navigator.clipboard.writeText(profileUrl);
        setShareSuccess(true);
        if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = setTimeout(
          () => setShareSuccess(false),
          2000
        );
      } catch {
        // Silent failure — no toast, no error state
      }
    }
  }, [artist.handle, artist.name]);

  const heroPearlClassName =
    'border border-white/12 bg-white/8 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-2xl';
  const primaryActionClassName =
    'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--profile-pearl-primary-bg)] px-5 py-3 text-mid font-[590] tracking-[-0.015em] text-[var(--profile-pearl-primary-fg)] shadow-[0_18px_40px_rgba(0,0,0,0.3)] transition-[transform,opacity] duration-slow hover:opacity-94 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent';

  return (
    <section
      className={`relative w-full overflow-hidden md:h-[56dvh] md:min-h-[520px] md:rounded-t-[30px] ${
        compact
          ? 'h-[40dvh] min-h-[320px] max-h-[460px]'
          : 'h-[48dvh] min-h-[420px] max-h-[620px]'
      }`}
      data-testid='profile-header'
    >
      <div className='absolute inset-0'>
        <ImageWithFallback
          src={heroImageUrl ?? artist.image_url}
          alt={artist.name}
          fill
          priority={true}
          sizes='(max-width: 767px) 100vw, 620px'
          className='object-cover object-center md:scale-[1.02]'
          fallbackVariant='avatar'
          fallbackClassName='bg-surface-2'
        />
      </div>

      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(180deg,rgba(4,6,10,0.02)_0%,rgba(6,8,12,0.14)_28%,rgba(7,8,10,0.76)_74%,rgba(7,8,10,0.96)_100%)]' />
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_46%,rgba(6,7,10,0.5)_70%,rgba(5,6,8,0.9)_100%)]' />

      <div className='relative flex h-full flex-col justify-between px-5 pb-6 pt-[max(env(safe-area-inset-top),1rem)] md:px-7 md:pb-8 md:pt-6'>
        <div className='flex justify-between gap-3'>
          <div className='flex items-start gap-2'>
            {spotlightLabel && spotlightValue ? (
              <div className={`${heroPearlClassName} rounded-full px-3.5 py-2`}>
                <p className='text-[0.72rem] font-[590] tracking-[0.01em] text-white/52'>
                  {spotlightLabel}
                </p>
                <p className='mt-0.5 text-[13px] font-[590] tracking-[-0.015em] text-white/90 md:text-sm'>
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
              onClick={handleShare}
              className={`${heroPearlClassName} inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-4 text-mid font-[590] tracking-[-0.015em] text-white/88 transition-[background-color,border-color,color,opacity] hover:bg-white/12 hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]`}
              aria-label={
                shareSuccess
                  ? `Copied ${artist.name}'s profile link`
                  : `Share ${artist.name}'s profile`
              }
            >
              {shareSuccess ? (
                <Check className='h-[17px] w-[17px]' aria-hidden='true' />
              ) : (
                <Share2 className='h-[17px] w-[17px]' aria-hidden='true' />
              )}
              <span className='sr-only md:not-sr-only md:inline'>
                {shareSuccess ? 'Copied' : 'Share'}
              </span>
            </button>
            <button
              type='button'
              onClick={onBellClick}
              className={`${heroPearlClassName} inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-4 text-mid font-[590] tracking-[-0.015em] text-white/88 transition-[background-color,border-color,color,opacity] hover:bg-white/12 hover:text-white hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]`}
              aria-label={`Get notified about ${artist.name}`}
            >
              <Bell className='h-[17px] w-[17px]' aria-hidden='true' />
              <span className='sr-only md:not-sr-only md:inline'>Notify</span>
            </button>
          </div>
        </div>

        <div className='mt-auto max-w-[32rem] space-y-4 md:space-y-5'>
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0 space-y-2 text-left'>
              {eyebrow ? (
                <p className='text-[12px] font-[590] tracking-[0.01em] text-white/58'>
                  {eyebrow}
                </p>
              ) : null}

              <h1
                className={`line-clamp-3 max-w-[21rem] font-[640] tracking-[-0.065em] text-white md:max-w-[30rem] md:text-[3.5rem] md:leading-[0.94] ${
                  compact ? 'text-[2.25rem]' : 'text-[2.65rem]'
                }`}
              >
                {artist.name}
              </h1>
            </div>

            <button
              type='button'
              onClick={onPlayClick}
              className={`${heroPearlClassName} inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 py-2.5 text-mid font-[590] tracking-[-0.015em] text-white/92 transition-[background-color,border-color,color,opacity] hover:bg-white/12 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]`}
              aria-label={`Listen to ${artist.name}`}
            >
              <Play
                className='mr-2 h-[17px] w-[17px] fill-current'
                aria-hidden='true'
              />
              Play
            </button>
          </div>

          <div className='flex flex-wrap items-center gap-3'>
            {primaryAction
              ? (() => {
                  const content = (
                    <>
                      {primaryActionKind === 'tickets' ? (
                        <Ticket
                          className='mr-2 h-[17px] w-[17px]'
                          aria-hidden='true'
                        />
                      ) : null}
                      {primaryAction.label}
                    </>
                  );
                  const label = primaryAction.ariaLabel ?? primaryAction.label;

                  return primaryAction.href ? (
                    <a
                      href={primaryAction.href}
                      target={primaryAction.external ? '_blank' : undefined}
                      rel={
                        primaryAction.external
                          ? 'noopener noreferrer'
                          : undefined
                      }
                      onClick={
                        primaryAction.external
                          ? undefined
                          : primaryAction.onClick
                      }
                      aria-label={label}
                      className={primaryActionClassName}
                    >
                      {content}
                    </a>
                  ) : (
                    <button
                      type='button'
                      onClick={primaryAction.onClick}
                      aria-label={label}
                      className={primaryActionClassName}
                    >
                      {content}
                    </button>
                  );
                })()
              : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use ArtistHero instead */
export const ProfileHeroCard = ArtistHero;
