'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Bell, MoreHorizontal, Play, Ticket } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { BASE_URL } from '@/constants/app';
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
  readonly compact?: boolean;
}

export function ArtistHero({
  artist,
  heroImageUrl,
  primaryAction,
  onPlayClick,
  onBellClick,
  primaryActionKind = 'listen',
  compact = false,
}: ArtistHeroProps) {
  const [shareSuccess, setShareSuccess] = useState(false);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bio = artist.tagline?.trim() ?? '';

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
      if (error instanceof Error && error.name === 'AbortError') return;

      try {
        await navigator.clipboard.writeText(profileUrl);
        setShareSuccess(true);
        if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = setTimeout(
          () => setShareSuccess(false),
          2000
        );
      } catch {
        return;
      }
    }
  }, [artist.handle, artist.name]);

  const primaryActionClassName =
    'inline-flex min-h-10 items-center justify-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-[14px] font-[590] tracking-[-0.015em] text-white/88 backdrop-blur-xl transition-opacity hover:opacity-92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]';

  return (
    <section
      className='relative w-full min-h-[100dvh] overflow-hidden md:h-[56dvh] md:min-h-[520px] md:rounded-t-[30px]'
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

      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(180deg,rgba(4,6,10,0.05)_0%,rgba(8,8,10,0.2)_28%,rgba(7,8,10,0.82)_72%,rgba(6,6,8,0.98)_100%)]' />
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,transparent_32%,rgba(5,6,8,0.36)_60%,rgba(6,7,8,0.92)_100%)]' />

      <div
        className={`relative flex min-h-[100dvh] flex-col px-4 pt-[max(env(safe-area-inset-top),1rem)] md:min-h-full md:px-7 md:pt-6 ${
          compact
            ? 'pb-[calc(env(safe-area-inset-bottom)+0.9rem)] md:pb-8'
            : 'pb-[calc(env(safe-area-inset-bottom)+1.25rem)] md:pb-8'
        }`}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-h-8'>
            {artist.is_verified ? (
              <div className='inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/22 px-2.5 py-1 text-[0.7rem] font-[600] tracking-[0.02em] text-white/74 backdrop-blur-xl'>
                <VerifiedBadge
                  size='sm'
                  className='bg-transparent p-0 text-sky-400'
                />
                <span>Verified Artist</span>
              </div>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <CircleIconButton
                ariaLabel='Open profile actions'
                size='sm'
                variant='frosted'
                className='border border-white/10 bg-black/18 text-white/78 hover:bg-black/28 hover:text-white'
              >
                <MoreHorizontal className='h-4 w-4' aria-hidden='true' />
              </CircleIconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              sideOffset={8}
              className='min-w-[140px]'
            >
              <DropdownMenuItem onClick={() => void handleShare()}>
                {shareSuccess ? 'Copied' : 'Share'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className='mt-auto space-y-3'>
          <div className='space-y-2'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <h1 className='line-clamp-2 text-[2.1rem] font-[640] tracking-[-0.06em] text-white md:text-[3.5rem] md:leading-[0.94]'>
                    {artist.name}
                  </h1>
                  {artist.is_verified ? (
                    <VerifiedBadge
                      size='sm'
                      className='mt-1 shrink-0 text-sky-400'
                    />
                  ) : null}
                </div>
              </div>

              <CircleIconButton
                ariaLabel={`Get notified about ${artist.name}`}
                size='sm'
                variant='frosted'
                className='mt-1 shrink-0 border border-white/10 bg-black/18 text-white/78 hover:bg-black/28 hover:text-white'
                onClick={onBellClick}
              >
                <Bell className='h-4 w-4' aria-hidden='true' />
              </CircleIconButton>
            </div>

            {bio ? (
              <p className='line-clamp-2 max-w-[18rem] text-[0.95rem] leading-5 text-white/62 md:max-w-[28rem] md:text-[1rem] md:leading-6'>
                {bio}
              </p>
            ) : null}
          </div>

          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={onPlayClick}
              className='inline-flex min-h-10 items-center justify-center rounded-full border border-white/12 bg-white/8 px-4 py-2 text-[14px] font-[590] tracking-[-0.015em] text-white/92 backdrop-blur-xl transition-opacity hover:opacity-92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))]'
              aria-label={`Listen to ${artist.name}`}
            >
              <Play className='mr-2 h-4 w-4 fill-current' aria-hidden='true' />
              Listen
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
                  className={`hidden md:inline-flex ${primaryActionClassName}`}
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
                  className={`hidden md:inline-flex ${primaryActionClassName}`}
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
