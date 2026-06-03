'use client';

import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProfileSuggestion } from '@/app/api/suggestions/route';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';

import type { UseSuggestedProfilesReturn } from '../hooks/useSuggestedProfiles';

// ============================================================================
// Platform icon mapping (provider_id -> SocialIcon platform name)
// ============================================================================

type SlideDirection = 'left' | 'right' | null;

function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.8)
    return 'bg-surface-1 border border-subtle text-success';
  if (confidence >= 0.5)
    return 'bg-surface-1 border border-subtle text-warning';
  return 'bg-surface-1 border border-subtle text-error';
}

const ICON_PLATFORM_MAP: Record<string, string> = {
  spotify: 'spotify',
  apple_music: 'apple_music',
  deezer: 'deezer',
  youtube_music: 'youtube',
  tidal: 'tidal',
  soundcloud: 'soundcloud',
  amazon_music: 'amazon',
  musicbrainz: 'website',
  instagram: 'instagram',
  twitter: 'x',
  tiktok: 'tiktok',
  facebook: 'facebook',
  youtube: 'youtube',
  twitch: 'twitch',
  discord: 'discord',
  bandcamp: 'bandcamp',
  website: 'website',
};

// ============================================================================
// Sub-components
// ============================================================================

function CarouselDots({
  total,
  current,
}: {
  readonly total: number;
  readonly current: number;
}) {
  if (total <= 1) return null;

  // Show max 7 dots, centering around current
  const maxDots = 7;
  let start = Math.max(0, current - Math.floor(maxDots / 2));
  const end = Math.min(total, start + maxDots);
  if (end - start < maxDots) {
    start = Math.max(0, end - maxDots);
  }

  return (
    <div className='flex items-center justify-center gap-1.5 pt-2'>
      {Array.from({ length: end - start }, (_, i) => {
        const index = start + i;
        return (
          <div
            key={index}
            aria-hidden
            className='system-b-suggested-profile-dot'
            data-active={index === current ? 'true' : undefined}
          />
        );
      })}
    </div>
  );
}

function CarouselCardHeader({
  heading,
  currentIndex,
  total,
  onPrev,
  onNext,
  isActioning,
}: {
  readonly heading: string;
  readonly currentIndex: number;
  readonly total: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly isActioning: boolean;
}) {
  return (
    <div className='flex items-center justify-between border-b border-(--system-b-app-frame-seam) px-3.5 py-2.5'>
      <div>
        <p className='text-2xs font-semibold tracking-normal text-tertiary-token'>
          Suggested identity
        </p>
        <p className='mt-0.5 text-app font-medium text-secondary-token'>
          {heading}
        </p>
      </div>
      <div className='flex items-center gap-1'>
        {total > 1 && (
          <span className='text-xs tabular-nums text-tertiary-token'>
            {currentIndex + 1} of {total}
          </span>
        )}
        {total > 1 && (
          <div className='flex items-center'>
            <button
              type='button'
              onClick={onPrev}
              disabled={currentIndex === 0 || isActioning}
              className={cn(
                'flex items-center justify-center rounded-lg text-tertiary-token transition-colors',
                'h-11 w-11 sm:h-auto sm:w-auto sm:rounded-md sm:p-1',
                'hover:bg-surface-0 hover:text-secondary-token',
                'disabled:opacity-30 disabled:cursor-not-allowed'
              )}
              aria-label='Previous suggestion'
            >
              <ChevronLeft className='h-5 w-5' />
            </button>
            <button
              type='button'
              onClick={onNext}
              disabled={currentIndex === total - 1 || isActioning}
              className={cn(
                'flex items-center justify-center rounded-lg text-tertiary-token transition-colors',
                'h-11 w-11 sm:h-auto sm:w-auto sm:rounded-md sm:p-1',
                'hover:bg-surface-0 hover:text-secondary-token',
                'disabled:opacity-30 disabled:cursor-not-allowed'
              )}
              aria-label='Next suggestion'
            >
              <ChevronRight className='h-5 w-5' />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileReadyCard({
  displayName,
  username,
  avatarUrl,
  onDismiss,
  direction,
  heading,
  currentIndex,
  total,
  onPrev,
  onNext,
  isActioning,
}: {
  readonly displayName?: string;
  readonly username?: string;
  readonly avatarUrl?: string | null;
  readonly onDismiss: () => void;
  readonly direction: SlideDirection;
  readonly heading: string;
  readonly currentIndex: number;
  readonly total: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly isActioning: boolean;
}) {
  return (
    <div
      className={cn(
        'system-b-suggested-profile-card',
        direction === 'left' && 'animate-slide-out-left',
        direction === 'right' && 'animate-slide-out-right'
      )}
    >
      <CarouselCardHeader
        heading={heading}
        currentIndex={currentIndex}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        isActioning={isActioning}
      />
      <div className='relative p-4'>
        {/* Dismiss button */}
        <button
          type='button'
          onClick={onDismiss}
          disabled={isActioning}
          className='absolute right-3 top-3 rounded-md p-1 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token disabled:opacity-30 disabled:cursor-not-allowed'
          aria-label='Dismiss'
        >
          <X className='h-3.5 w-3.5' />
        </button>

        {/* Header */}
        <div className='mb-4 flex items-center gap-2'>
          <CheckCircle2 className='h-4 w-4 text-success' />
          <p className='text-sm font-medium text-primary-token'>
            Your profile is live
          </p>
        </div>

        {/* Profile info */}
        <div className='flex items-center gap-3 mb-4'>
          {avatarUrl ? (
            <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2'>
              <Image
                src={avatarUrl}
                alt={displayName ?? 'Profile'}
                fill
                className='object-cover'
                sizes='48px'
                unoptimized
              />
            </div>
          ) : (
            <div className='flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-tertiary-token'>
              <span className='text-lg font-medium'>
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
          )}
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium text-primary-token'>
              {displayName ?? 'Your profile'}
            </p>
            {username && (
              <p className='truncate text-xs text-tertiary-token'>
                jov.ie/{username}
              </p>
            )}
          </div>
        </div>

        {/* CTA */}
        <a
          href={username ? `/${username}` : '/'}
          target='_blank'
          rel='noopener noreferrer'
          className='system-b-suggested-profile-primary-link'
        >
          View your profile
          <ExternalLink className='h-3.5 w-3.5' />
        </a>
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onConfirm,
  onReject,
  isActioning,
  direction,
  heading,
  currentIndex,
  total,
  onPrev,
  onNext,
}: {
  readonly suggestion: ProfileSuggestion;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
  readonly isActioning: boolean;
  readonly direction: SlideDirection;
  readonly heading: string;
  readonly currentIndex: number;
  readonly total: number;
  readonly onPrev: () => void;
  readonly onNext: () => void;
}) {
  const isAvatar = suggestion.type === 'avatar';
  const isPlaylistFallback = suggestion.type === 'playlist_fallback';
  const iconPlatform =
    ICON_PLATFORM_MAP[suggestion.platform] ?? suggestion.platform;

  return (
    <div
      className={cn(
        'system-b-suggested-profile-card',
        direction === 'left' && 'animate-slide-out-left',
        direction === 'right' && 'animate-slide-out-right'
      )}
    >
      <CarouselCardHeader
        heading={heading}
        currentIndex={currentIndex}
        total={total}
        onPrev={onPrev}
        onNext={onNext}
        isActioning={isActioning}
      />
      <div className='p-4'>
        {/* Header with platform icon */}
        <div className='flex items-center gap-2.5 mb-3'>
          <div className='system-b-suggested-profile-icon-shell'>
            {isAvatar ? (
              <Camera className='h-4 w-4 text-secondary-token' />
            ) : (
              <SocialIcon
                platform={iconPlatform}
                className='h-4 w-4'
                aria-hidden
              />
            )}
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium text-primary-token'>
              {suggestion.title}
            </p>
            <p className='truncate text-xs text-tertiary-token'>
              {suggestion.subtitle}
            </p>
          </div>
          {suggestion.externalUrl && (
            <a
              href={suggestion.externalUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='shrink-0 rounded-md p-1.5 text-tertiary-token transition-colors hover:bg-surface-2 hover:text-secondary-token'
              aria-label={`Open ${suggestion.platformLabel} link`}
            >
              <ExternalLink className='h-3.5 w-3.5' />
            </a>
          )}
        </div>

        {/* Image preview for DSP matches and avatars */}
        {suggestion.imageUrl && (
          <div
            className={cn(
              'system-b-suggested-profile-image',
              isAvatar
                ? 'system-b-suggested-profile-image-avatar'
                : 'system-b-suggested-profile-image-wide'
            )}
          >
            <Image
              src={suggestion.imageUrl}
              alt={suggestion.title}
              fill
              className='object-cover'
              sizes={isAvatar ? '96px' : '(max-width: 672px) 100vw, 672px'}
              unoptimized
            />
          </div>
        )}

        {/* Confidence badge */}
        {suggestion.confidence !== null && suggestion.type !== 'avatar' && (
          <div className='mb-3'>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                confidenceBadgeClass(suggestion.confidence)
              )}
            >
              {Math.round(suggestion.confidence * 100)}% match
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className='flex gap-2'>
          <button
            type='button'
            onClick={onReject}
            disabled={isActioning}
            className={cn(
              'system-b-suggested-profile-action system-b-suggested-profile-action-secondary',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isActioning ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <X className='h-4 w-4' />
            )}
            {isAvatar ? 'Skip' : isPlaylistFallback ? 'Dismiss' : 'Not me'}
          </button>
          <button
            type='button'
            onClick={onConfirm}
            disabled={isActioning}
            className={cn(
              'system-b-suggested-profile-action system-b-suggested-profile-action-primary',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isActioning ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <Check className='h-4 w-4' />
            )}
            {isAvatar
              ? 'Use photo'
              : isPlaylistFallback
                ? 'Use Playlist'
                : "That's me"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

type SuggestedProfilesCarouselProps = Readonly<
  Pick<
    UseSuggestedProfilesReturn,
    | 'suggestions'
    | 'isLoading'
    | 'currentIndex'
    | 'total'
    | 'next'
    | 'prev'
    | 'confirm'
    | 'reject'
    | 'isActioning'
  > & {
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
  }
>;

export function SuggestedProfilesCarousel({
  suggestions,
  isLoading,
  currentIndex,
  total,
  next,
  prev,
  confirm,
  reject,
  isActioning,
  username,
  displayName,
  avatarUrl,
}: SuggestedProfilesCarouselProps) {
  const [slideDirection, setSlideDirection] = useState<SlideDirection>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleConfirm = useCallback(async () => {
    setSlideDirection('left');
    await confirm();
    // Reset slide direction after animation
    timeoutRef.current = setTimeout(() => setSlideDirection(null), 50);
  }, [confirm]);

  const handleReject = useCallback(async () => {
    setSlideDirection('right');
    await reject();
    timeoutRef.current = setTimeout(() => setSlideDirection(null), 50);
  }, [reject]);

  const handlePrev = useCallback(() => {
    setSlideDirection(null);
    prev();
  }, [prev]);

  const handleNext = useCallback(() => {
    setSlideDirection(null);
    next();
  }, [next]);

  // Don't render anything while loading or if there are no suggestions
  if (isLoading || total === 0) return null;

  const current = suggestions[currentIndex];
  if (!current) return null;

  // Determine the section heading based on current card type
  let heading: string;
  if (current.type === 'profile_ready') {
    heading = 'Welcome';
  } else if (current.type === 'avatar') {
    heading = 'Choose your profile photo';
  } else if (current.type === 'playlist_fallback') {
    heading = 'Playlist suggestion';
  } else {
    heading = 'We found profiles that might be yours';
  }

  return (
    <div className='space-y-3'>
      {/* Card */}
      {current.type === 'profile_ready' ? (
        <ProfileReadyCard
          key={current.id}
          displayName={displayName}
          username={username}
          avatarUrl={avatarUrl}
          onDismiss={handleReject}
          direction={slideDirection}
          heading={heading}
          currentIndex={currentIndex}
          total={total}
          onPrev={handlePrev}
          onNext={handleNext}
          isActioning={isActioning}
        />
      ) : (
        <SuggestionCard
          key={current.id}
          suggestion={current}
          onConfirm={handleConfirm}
          onReject={handleReject}
          isActioning={isActioning}
          direction={slideDirection}
          heading={heading}
          currentIndex={currentIndex}
          total={total}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      )}

      {/* Progress dots */}
      <CarouselDots total={total} current={currentIndex} />
    </div>
  );
}
