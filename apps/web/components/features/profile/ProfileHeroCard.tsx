'use client';

import { Bell, Play } from 'lucide-react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { ImageWithFallback } from '@/components/atoms/ImageWithFallback';
import { SocialLink } from '@/components/molecules/SocialLink';
import type { SwipeableProfileMode } from '@/features/profile/contracts';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { Artist, LegacySocialLink } from '@/types/db';

type HeroRelease = {
  readonly title: string;
  readonly artworkUrl: string | null;
  readonly releaseDate: Date | string | null;
  readonly releaseType: string;
};

const MODE_LABELS: Record<SwipeableProfileMode, string> = {
  profile: 'Home',
  listen: 'Listen',
  tour: 'Tour',
  about: 'About',
  tip: 'Tip',
};

interface ArtistHeroProps {
  readonly artist: Artist;
  readonly latestRelease?: HeroRelease | null;
  readonly activeMode: SwipeableProfileMode;
  readonly activeIndex: number;
  readonly modes: readonly SwipeableProfileMode[];
  readonly headerSocialLinks: LegacySocialLink[];
  readonly onModeSelect: (mode: SwipeableProfileMode) => void;
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
  latestRelease,
  activeMode,
  activeIndex,
  modes,
  headerSocialLinks,
  onModeSelect,
  onPlayClick,
  onBellClick,
}: ArtistHeroProps) {
  const eyebrow = getReleaseEyebrow(latestRelease);
  const isMobile = useBreakpointDown('md');

  return (
    <section className='relative h-[45dvh] min-h-[340px] max-h-[480px] w-full overflow-hidden'>
      {/* Artist photo — full bleed background */}
      <div className='absolute inset-0'>
        <ImageWithFallback
          src={artist.image_url}
          alt={artist.name}
          fill
          priority
          sizes='100vw'
          className='object-cover object-[center_30%]'
          fallbackVariant='avatar'
        />
      </div>

      {/* Top vignette — subtle contrast for floating buttons */}
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent via-40% to-transparent' />

      {/* Bottom gradient — readable text zone, fades into bg-base */}
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--color-bg-base)] via-[var(--color-bg-base)]/40 via-25% to-transparent' />

      {/* Content overlay */}
      <div className='relative flex h-full flex-col justify-between px-4 pb-4 pt-[max(env(safe-area-inset-top),0.75rem)]'>
        {/* Top row — social links (left) + bell (right) */}
        <div className='flex items-start justify-between pt-2'>
          <div className='flex items-center gap-2'>
            {headerSocialLinks.map(link => (
              <SocialLink
                key={link.id}
                link={link}
                handle={artist.handle}
                artistName={artist.name}
              />
            ))}
          </div>

          <CircleIconButton
            ariaLabel={`Get notified about ${artist.name}`}
            size='md'
            variant='frosted'
            onClick={onBellClick}
          >
            <Bell className='h-4 w-4' aria-hidden='true' />
          </CircleIconButton>
        </div>

        {/* Bottom content — play + name, nav */}
        <div className='mt-auto space-y-4'>
          <div className='flex items-end gap-3'>
            <CircleIconButton
              ariaLabel={`Listen to ${artist.name}`}
              size='lg'
              variant='frosted'
              className='shrink-0'
              onClick={onPlayClick}
            >
              <Play className='h-5 w-5 fill-current' aria-hidden='true' />
            </CircleIconButton>
            <div className='min-w-0 space-y-1.5'>
              {eyebrow ? (
                <p className='text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60'>
                  {eyebrow}
                </p>
              ) : null}
              <h1 className='text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl'>
                {artist.name}
              </h1>
            </div>
          </div>

          {/* Mode navigation */}
          {isMobile ? (
            <div
              className='flex items-center justify-center gap-2 pt-1'
              role='tablist'
              aria-label='Profile sections'
            >
              {modes.map((mode, index) => {
                const isActive = index === activeIndex;
                return (
                  <button
                    key={mode}
                    type='button'
                    role='tab'
                    aria-selected={isActive}
                    aria-label={`View ${MODE_LABELS[mode]}`}
                    aria-controls={`profile-pane-${mode}`}
                    className={`rounded-full transition-all duration-200 ease-out ${
                      isActive
                        ? 'h-2 w-5 bg-white'
                        : 'h-1.5 w-1.5 bg-white/30 hover:bg-white/50'
                    }`}
                    onClick={() => onModeSelect(mode)}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className='flex items-center justify-center'
              role='tablist'
              aria-label='Profile sections'
            >
              <div className='inline-flex items-center gap-1 rounded-full bg-black/30 p-1 backdrop-blur-xl'>
                {modes.map(mode => {
                  const isActive = mode === activeMode;
                  return (
                    <button
                      key={mode}
                      type='button'
                      role='tab'
                      aria-selected={isActive}
                      aria-controls={`profile-pane-${mode}`}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'text-white/60 hover:text-white/90'
                      }`}
                      onClick={() => onModeSelect(mode)}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use ArtistHero instead */
export const ProfileHeroCard = ArtistHero;
