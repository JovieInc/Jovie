'use client';

import { Button, HostDrawnSelect } from '@jovie/ui';
import { BadgeCheck, Link2 } from 'lucide-react';
import Image from 'next/image';
import type { RefObject } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { presentUnmanagedListing } from '@/lib/profile/artist-status-presentation';
import type { SpotifyArtistResult } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import { formatFollowers } from './hero-spotify-search-utils';

const LOADING_SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'];

export interface HeroSpotifyResultsProps {
  readonly resultsId: string;
  readonly isEditorial: boolean;
  readonly results: readonly SpotifyArtistResult[];
  readonly state: 'idle' | 'loading' | 'empty' | 'error' | 'success';
  readonly isLoading: boolean;
  readonly isInvalidQuery: boolean;
  readonly activeIndex: number;
  readonly pasteUrlIndex: number;
  readonly totalItems: number;
  readonly resultsListRef: RefObject<HTMLDivElement | null>;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onSelectArtist: (artist: SpotifyArtistResult) => void;
  readonly onPasteUrl: () => void;
  readonly onRetry: () => void;
}

/** Dropdown of Spotify artist results under the hero search field. */
export function HeroSpotifyResults({
  resultsId,
  isEditorial,
  results,
  state,
  isLoading,
  isInvalidQuery,
  activeIndex,
  pasteUrlIndex,
  totalItems,
  resultsListRef,
  onActiveIndexChange,
  onSelectArtist,
  onPasteUrl,
  onRetry,
}: Readonly<HeroSpotifyResultsProps>) {
  return (
    <div
      className={cn(
        'absolute top-full left-0 z-50 w-full mt-2 rounded-xl border border-default overflow-hidden bg-surface-0 shadow-lg',
        isEditorial && 'homepage-name-search__results text-left'
      )}
    >
      <HostDrawnSelect
        id={resultsId}
        visuallyHidden
        disabled={isLoading}
        size={Math.min(totalItems, 6)}
        aria-label='Spotify Artist Results'
        value={
          activeIndex === pasteUrlIndex
            ? '__paste__'
            : (results[activeIndex]?.id ?? '')
        }
        onChange={event => {
          if (event.target.value === '__paste__') {
            onPasteUrl();
            return;
          }
          const selectedArtist = results.find(
            artist => artist.id === event.target.value
          );
          if (selectedArtist) {
            onSelectArtist(selectedArtist);
          }
        }}
      >
        <option value='' disabled>
          Select an artist
        </option>
        {results.map((artist, index) => (
          <option
            key={artist.id}
            id={`${resultsId}-result-${index}`}
            value={artist.id}
          >
            {artist.name}
            {artist.followers ? ` — ${formatFollowers(artist.followers)}` : ''}
          </option>
        ))}
        <option id={`${resultsId}-result-${pasteUrlIndex}`} value='__paste__'>
          Paste a Spotify URL instead
        </option>
      </HostDrawnSelect>

      {isInvalidQuery && (
        <p
          id={`${resultsId}-validation`}
          role='status'
          className='p-4 text-sm text-secondary-token'
        >
          Enter an artist name or paste a Spotify artist link.
        </p>
      )}

      {/* Loading skeleton */}
      {state === 'loading' && results.length === 0 && (
        <div className='p-3 space-y-2'>
          {LOADING_SKELETON_KEYS.map(key => (
            <div key={key} className='flex items-center gap-3 animate-pulse'>
              <div className='w-10 h-10 rounded-full bg-surface-1' />
              <div className='flex-1 space-y-1'>
                <div className='h-4 w-32 rounded bg-surface-1' />
                <div className='h-3 w-20 rounded bg-surface-1' />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isInvalidQuery && state === 'empty' && (
        <div className='p-4 text-center'>
          <p className='text-sm text-secondary-token'>No artists found</p>
        </div>
      )}

      {/* Error state */}
      {!isInvalidQuery && state === 'error' && (
        <div className='p-4 text-center'>
          <p role='alert' className='text-sm text-error'>
            Search failed.
          </p>
          <Button
            type='button'
            size='sm'
            variant='tertiary'
            className='mt-2'
            onClick={onRetry}
          >
            Try Again
          </Button>
        </div>
      )}

      {/* Artist results */}
      {results.length > 0 && (
        <div
          ref={resultsListRef}
          className='max-h-64 overflow-y-auto'
          aria-hidden='true'
        >
          {results.map((artist, index) => (
            <Button
              key={artist.id}
              type='button'
              variant={index === activeIndex ? 'secondary' : 'ghost'}
              disabled={isLoading}
              tabIndex={0}
              className='w-full justify-start'
              onClick={() => onSelectArtist(artist)}
              onKeyDown={event =>
                handleActivationKeyDown(event, () => onSelectArtist(artist))
              }
              onMouseEnter={() => onActiveIndexChange(index)}
            >
              <div className='relative mr-3 h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-1'>
                {artist.imageUrl ? (
                  <Image
                    src={artist.imageUrl}
                    alt={artist.name}
                    fill
                    sizes='40px'
                    className='object-cover'
                    unoptimized
                  />
                ) : (
                  <div className='w-full h-full flex items-center justify-center'>
                    <SocialIcon
                      platform='spotify'
                      className='w-5 h-5 text-tertiary-token'
                    />
                  </div>
                )}
              </div>
              <div className='mr-3 min-w-0 flex-1 text-left'>
                <div className='font-medium truncate text-sm text-primary-token'>
                  {artist.name}
                </div>
                {artist.followers ? (
                  <div className='text-xs tabular-nums text-tertiary-token'>
                    {formatFollowers(artist.followers)}
                  </div>
                ) : null}
              </div>
              {artist.isClaimed && (
                <span
                  className='shrink-0 rounded-full bg-brand-spotify-subtle px-2 py-0.5 text-3xs font-semibold text-brand-spotify'
                  data-testid='listing-badge'
                >
                  {presentUnmanagedListing().label}
                </span>
              )}
              {artist.verified && (
                <div
                  className='shrink-0 text-brand-spotify'
                  data-testid='verified-badge'
                >
                  <BadgeCheck className='h-4 w-4' aria-hidden='true' />
                </div>
              )}
            </Button>
          ))}
        </div>
      )}

      {/* "Paste URL" option */}
      <div className='mt-1'>
        <Button
          type='button'
          variant={activeIndex === pasteUrlIndex ? 'secondary' : 'ghost'}
          tabIndex={0}
          className='w-full justify-start'
          onClick={onPasteUrl}
          onKeyDown={event =>
            handleActivationKeyDown(event, () => onPasteUrl())
          }
          onMouseEnter={() => onActiveIndexChange(pasteUrlIndex)}
        >
          <div className='mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-1'>
            <Link2 className='h-5 w-5 text-tertiary-token' aria-hidden='true' />
          </div>
          <div className='flex-1 text-left'>
            <div className='font-medium text-sm text-primary-token'>
              Paste a Spotify URL instead
            </div>
            <div className='text-xs text-tertiary-token'>
              open.spotify.com/artist/...
            </div>
          </div>
        </Button>
      </div>
    </div>
  );
}
