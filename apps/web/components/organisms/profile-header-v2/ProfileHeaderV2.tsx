'use client';

import { Play } from 'lucide-react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { SocialLink } from '@/components/molecules/SocialLink';
import type { SwipeableProfileMode } from '@/features/profile/contracts';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { Artist, LegacySocialLink } from '@/types/db';

const MODE_LABELS: Record<SwipeableProfileMode, string> = {
  profile: 'Home',
  tour: 'Tour',
  about: 'About',
  pay: 'Pay',
};

interface ProfileHeaderV2Props {
  readonly artist: Artist;
  readonly activeMode: SwipeableProfileMode;
  readonly activeIndex: number;
  readonly modes: readonly SwipeableProfileMode[];
  readonly headerSocialLinks: LegacySocialLink[];
  readonly onModeSelect: (mode: SwipeableProfileMode) => void;
  readonly onPlayClick: () => void;
}

export function ProfileHeaderV2({
  artist,
  activeMode,
  activeIndex,
  modes,
  headerSocialLinks,
  onModeSelect,
  onPlayClick,
}: ProfileHeaderV2Props) {
  const isMobile = useBreakpointDown('md');

  return (
    <header className='sticky top-0 z-30 border-b border-subtle/30 bg-base/80 px-3 py-3 backdrop-blur-xl'>
      <div className='flex items-center gap-3'>
        <CircleIconButton
          ariaLabel={`Listen to ${artist.name}`}
          size='md'
          variant='frosted'
          className='shrink-0'
          onClick={onPlayClick}
        >
          <Play className='h-4 w-4 fill-current' aria-hidden='true' />
        </CircleIconButton>

        <div className='flex min-w-0 flex-1 items-center gap-3'>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold text-primary-token'>
              {artist.name}
            </p>
            {!isMobile && (
              <div
                className='mt-1.5 flex items-center gap-1'
                role='tablist'
                aria-label='Profile sections'
              >
                {modes.map(mode => {
                  const isActive = mode === activeMode;

                  return (
                    <button
                      key={mode}
                      type='button'
                      role='tab'
                      aria-selected={isActive}
                      aria-controls={`profile-pane-${mode}`}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-1 text-secondary-token hover:text-primary-token'
                      }`}
                      onClick={() => onModeSelect(mode)}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          {headerSocialLinks.map(link => (
            <SocialLink
              key={link.id}
              link={link}
              handle={artist.handle}
              artistName={artist.name}
            />
          ))}
        </div>
      </div>

      {isMobile && (
        <div
          className='mt-3 flex items-center justify-center gap-2'
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
                    ? 'h-2 w-5 bg-primary'
                    : 'h-1.5 w-1.5 bg-muted/40 hover:bg-muted/60'
                }`}
                onClick={() => onModeSelect(mode)}
              />
            );
          })}
        </div>
      )}
    </header>
  );
}
