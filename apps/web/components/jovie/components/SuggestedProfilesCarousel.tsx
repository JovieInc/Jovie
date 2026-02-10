'use client';

import {
  Camera,
  Check,
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

import { useSuggestedProfiles } from '../hooks/useSuggestedProfiles';

// ============================================================================
// Platform icon mapping (provider_id -> SocialIcon platform name)
// ============================================================================

function confidenceBadgeClass(confidence: number): string {
  if (confidence >= 0.8) return 'bg-emerald-500/15 text-emerald-400';
  if (confidence >= 0.5) return 'bg-amber-500/15 text-amber-400';
  return 'bg-red-500/15 text-red-400';
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
            className={cn(
              'h-1.5 rounded-full transition-all duration-200',
              index === current ? 'w-4 bg-accent' : 'w-1.5 bg-tertiary-token/30'
            )}
          />
        );
      })}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onConfirm,
  onReject,
  isActioning,
  direction,
}: {
  readonly suggestion: ProfileSuggestion;
  readonly onConfirm: () => void;
  readonly onReject: () => void;
  readonly isActioning: boolean;
  readonly direction: 'left' | 'right' | null;
}) {
  const isAvatar = suggestion.type === 'avatar';
  const iconPlatform =
    ICON_PLATFORM_MAP[suggestion.platform] ?? suggestion.platform;

  return (
    <div
      className={cn(
        'rounded-xl border border-subtle bg-surface-1 overflow-hidden',
        'transition-all duration-300 ease-out',
        direction === 'left' && 'animate-slide-out-left',
        direction === 'right' && 'animate-slide-out-right'
      )}
    >
      <div className='p-4'>
        {/* Header with platform icon */}
        <div className='flex items-center gap-2.5 mb-3'>
          <div className='flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2'>
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
              aria-label={`Open ${suggestion.platformLabel} profile`}
            >
              <ExternalLink className='h-3.5 w-3.5' />
            </a>
          )}
        </div>

        {/* Image preview for DSP matches and avatars */}
        {suggestion.imageUrl && (
          <div
            className={cn(
              'relative mb-3 overflow-hidden rounded-lg bg-surface-2',
              isAvatar ? 'mx-auto h-24 w-24 rounded-full' : 'h-16 w-full'
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
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg',
              'border border-subtle px-3 py-2 text-sm font-medium',
              'text-secondary-token transition-colors',
              'hover:bg-surface-2 hover:text-primary-token',
              'focus:outline-none focus:ring-2 focus:ring-accent/20',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isActioning ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
            ) : (
              <X className='h-3.5 w-3.5' />
            )}
            {isAvatar ? 'Skip' : 'Not me'}
          </button>
          <button
            type='button'
            onClick={onConfirm}
            disabled={isActioning}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg',
              'bg-accent px-3 py-2 text-sm font-medium text-on-accent',
              'transition-colors hover:bg-accent/90',
              'focus:outline-none focus:ring-2 focus:ring-accent/20',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isActioning ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
            ) : (
              <Check className='h-3.5 w-3.5' />
            )}
            {isAvatar ? 'Use photo' : "That's me"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface SuggestedProfilesCarouselProps {
  readonly profileId: string;
}

export function SuggestedProfilesCarousel({
  profileId,
}: SuggestedProfilesCarouselProps) {
  const {
    suggestions,
    isLoading,
    currentIndex,
    total,
    next,
    prev,
    confirm,
    reject,
    isActioning,
  } = useSuggestedProfiles(profileId);

  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(
    null
  );
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
  const heading =
    current.type === 'avatar'
      ? 'Choose your profile photo'
      : 'We found profiles that might be yours';

  return (
    <div className='space-y-2'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <p className='text-xs font-medium text-secondary-token'>{heading}</p>
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
                onClick={handlePrev}
                disabled={currentIndex === 0 || isActioning}
                className={cn(
                  'rounded-md p-1 text-tertiary-token transition-colors',
                  'hover:bg-surface-2 hover:text-secondary-token',
                  'disabled:opacity-30 disabled:cursor-not-allowed'
                )}
                aria-label='Previous suggestion'
              >
                <ChevronLeft className='h-3.5 w-3.5' />
              </button>
              <button
                type='button'
                onClick={handleNext}
                disabled={currentIndex === total - 1 || isActioning}
                className={cn(
                  'rounded-md p-1 text-tertiary-token transition-colors',
                  'hover:bg-surface-2 hover:text-secondary-token',
                  'disabled:opacity-30 disabled:cursor-not-allowed'
                )}
                aria-label='Next suggestion'
              >
                <ChevronRight className='h-3.5 w-3.5' />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Card */}
      <SuggestionCard
        key={current.id}
        suggestion={current}
        onConfirm={handleConfirm}
        onReject={handleReject}
        isActioning={isActioning}
        direction={slideDirection}
      />

      {/* Progress dots */}
      <CarouselDots total={total} current={currentIndex} />
    </div>
  );
}
