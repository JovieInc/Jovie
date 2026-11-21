'use client';

import {
  HostDrawnSelect,
  Input,
  Spinner as LoadingSpinner,
  PlainButton,
} from '@jovie/ui';
import { X } from 'lucide-react';
import Image from 'next/image';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';

import type { ArtistSearchModeProps } from './types';
import {
  type UseArtistSearchModeReturn,
  useArtistSearchMode,
} from './useArtistSearchMode';
import { formatFollowers } from './utils';

const ARTIST_SEARCH_LOADING_KEYS = Array.from(
  { length: 3 },
  (_, i) => `artist-search-loading-${i + 1}`
);

export function UniversalLinkInputArtistSearchMode({
  provider,
  creatorName,
  disabled,
  onSelect,
  onExit,
  onQueryChange,
  inputRef,
  focusInput,
}: Readonly<ArtistSearchModeProps>) {
  const mode = useArtistSearchMode({
    provider,
    creatorName,
    onSelect,
    onExit,
    onQueryChange,
    focusInput,
  });

  return (
    <UniversalLinkInputArtistSearchModeView
      {...mode}
      disabled={disabled}
      inputRef={inputRef}
    />
  );
}

export interface UniversalLinkInputArtistSearchModeViewProps
  extends UseArtistSearchModeReturn {
  readonly disabled?: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
}

/** Presentational half: renders the search field and results from hook state. */
export function UniversalLinkInputArtistSearchModeView({
  disabled,
  inputRef,
  searchQuery,
  showResults,
  activeResultIndex,
  results,
  state,
  error,
  resultsListRef,
  searchPlatform,
  iconColor,
  iconBg,
  handleSearchInputChange,
  handleSearchKeyDown,
  handleArtistSelect,
  exitSearchMode,
  setActiveResultIndex,
  setShowResults,
}: Readonly<UniversalLinkInputArtistSearchModeViewProps>) {
  return (
    <div className='relative w-full'>
      <div
        className={cn(
          'relative flex w-full items-center gap-2 overflow-hidden border border-default bg-surface-1 px-2 py-1 shadow-xs transition-colors',
          'focus-within:ring-2 focus-within:ring-accent',
          showResults ? 'rounded-t-3xl border-b-0' : 'rounded-full',
          disabled && 'opacity-50'
        )}
      >
        <div className='flex h-10 w-10 items-center justify-center rounded-full shrink-0'>
          <div
            className='flex items-center justify-center w-6 h-6 rounded-full'
            style={{ backgroundColor: iconBg, color: iconColor }}
            aria-hidden='true'
          >
            <SocialIcon
              platform={searchPlatform?.icon || 'spotify'}
              className='w-3.5 h-3.5'
            />
          </div>
        </div>

        <label htmlFor='artist-search-input' className='sr-only'>
          Search Spotify artists
        </label>
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          id='artist-search-input'
          type='text'
          inputSize='lg'
          placeholder='Search Spotify artists...'
          value={searchQuery}
          onChange={handleSearchInputChange}
          onKeyDown={handleSearchKeyDown}
          onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          disabled={disabled}
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='border-0 bg-transparent px-0 pr-14 focus-visible:ring-0 focus-visible:ring-offset-0'
          role='combobox'
          aria-expanded={showResults && results.length > 0}
          aria-controls='artist-search-results'
          aria-activedescendant={
            activeResultIndex >= 0
              ? `artist-result-${activeResultIndex}`
              : undefined
          }
          aria-describedby='artist-search-status'
        />

        <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
          {state === 'loading' && (
            <LoadingSpinner size='sm' tone='muted' label='Searching' />
          )}
          <PlainButton
            type='button'
            onClick={exitSearchMode}
            className='relative flex items-center justify-center w-5 h-5 rounded-full before:absolute before:left-1/2 before:top-1/2 before:size-10 before:-translate-x-1/2 before:-translate-y-1/2 text-tertiary-token hover:bg-surface-2 hover:text-secondary-token transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
            aria-label='Exit Search Mode'
          >
            <X className='w-4 h-4' />
          </PlainButton>
        </div>
      </div>

      {showResults && (
        <div className='absolute z-50 w-full overflow-hidden rounded-b-3xl border-x-2 border-b-2 border-accent bg-surface-1 shadow-popover'>
          {state === 'loading' && results.length === 0 && (
            <div className='p-3 space-y-2'>
              {ARTIST_SEARCH_LOADING_KEYS.map(key => (
                <div key={key} className='flex items-center gap-3'>
                  <div className='w-10 h-10 rounded-full skeleton' />
                  <div className='flex-1 space-y-1'>
                    <div className='h-4 w-32 rounded skeleton' />
                    <div className='h-3 w-20 rounded skeleton' />
                  </div>
                </div>
              ))}
            </div>
          )}

          {state === 'empty' && (
            <div className='p-4 text-center'>
              <p className='text-app text-secondary-token'>No artists found</p>
              <PlainButton
                type='button'
                onClick={exitSearchMode}
                className='mt-2 text-app text-accent hover:underline'
              >
                Add link manually
              </PlainButton>
            </div>
          )}

          {state === 'error' && (
            <div className='p-4 text-center'>
              <p className='text-app text-destructive'>
                {error || 'Search failed'}
              </p>
              <PlainButton
                type='button'
                onClick={exitSearchMode}
                className='mt-2 text-app text-accent hover:underline'
              >
                Add link manually
              </PlainButton>
            </div>
          )}

          {results.length > 0 && (
            <>
              <HostDrawnSelect
                visuallyHidden
                id='artist-search-results'
                size={Math.min(results.length, 5)}
                aria-label='Artist Search Results'
                value={
                  activeResultIndex >= 0 && results[activeResultIndex]
                    ? results[activeResultIndex].id
                    : ''
                }
                onChange={event => {
                  const selectedArtist = results.find(
                    artist => artist.id === event.target.value
                  );
                  if (selectedArtist) {
                    handleArtistSelect(selectedArtist);
                  }
                }}
              >
                <option value='' disabled>
                  Select an artist
                </option>
                {results.map((artist, index) => (
                  <option
                    key={artist.id}
                    id={`artist-result-${index}`}
                    value={artist.id}
                  >
                    {artist.name}
                    {artist.followers
                      ? ` — ${formatFollowers(artist.followers)}`
                      : ''}
                  </option>
                ))}
              </HostDrawnSelect>
              <div
                ref={resultsListRef}
                className='max-h-64 overflow-y-auto'
                aria-hidden='true'
              >
                {results.map((artist, index) => (
                  <PlainButton
                    key={artist.id}
                    type='button'
                    tabIndex={0}
                    className={cn(
                      'flex items-center gap-3 p-3 cursor-pointer transition-colors border-0 bg-transparent w-full text-left',
                      index === activeResultIndex
                        ? 'bg-surface-2'
                        : 'hover:bg-surface-2'
                    )}
                    onClick={() => handleArtistSelect(artist)}
                    onKeyDown={event =>
                      handleActivationKeyDown(event, () =>
                        handleArtistSelect(artist)
                      )
                    }
                    onMouseEnter={() => setActiveResultIndex(index)}
                  >
                    <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-3'>
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
                            className='h-5 w-5 text-tertiary-token'
                          />
                        </div>
                      )}
                    </div>

                    <div className='flex-1 min-w-0'>
                      <div className='truncate font-caption text-primary-token'>
                        {artist.name}
                      </div>
                      {artist.followers && (
                        <div className='text-app text-tertiary-token'>
                          {formatFollowers(artist.followers)}
                        </div>
                      )}
                    </div>

                    {artist.verified && (
                      <div className='shrink-0 text-accent'>
                        <svg
                          className='w-4 h-4'
                          viewBox='0 0 20 20'
                          fill='currentColor'
                          aria-hidden='true'
                        >
                          <path
                            fillRule='evenodd'
                            d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                            clipRule='evenodd'
                          />
                        </svg>
                      </div>
                    )}
                  </PlainButton>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div id='artist-search-status' className='sr-only' aria-live='polite'>
        {state === 'loading' && 'Searching...'}
        {state === 'empty' && 'No artists found'}
        {state === 'error' && (error || 'Search failed')}
        {state === 'success' &&
          `${results.length} artists found. Use arrow keys to navigate.`}
      </div>
    </div>
  );
}
