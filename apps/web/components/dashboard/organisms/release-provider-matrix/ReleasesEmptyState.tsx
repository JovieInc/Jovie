'use client';

import { Input } from '@jovie/ui';
import Image from 'next/image';
import { useCallback, useReducer, useRef } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import {
  formatFollowers,
  initialState,
  releasesEmptyStateReducer,
  useSearchKeyboard,
  useSpotifyConnect,
} from './releases-empty-state';

interface ReleasesEmptyStateProps {
  readonly onConnected?: (
    releases: ReleaseViewModel[],
    artistName: string
  ) => void;
  readonly onImportStart?: (artistName: string) => void;
}

export function ReleasesEmptyState({
  onConnected,
  onImportStart,
}: ReleasesEmptyStateProps) {
  const [formState, dispatch] = useReducer(
    releasesEmptyStateReducer,
    initialState
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  const {
    results,
    state: searchState,
    error: searchError,
    search,
    clear,
  } = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });

  const {
    isPending,
    extractSpotifyArtistId,
    connectFromUrl,
    handleArtistSelect,
    handleManualSubmit,
  } = useSpotifyConnect({
    dispatch,
    searchClear: clear,
    onConnected,
    onImportStart,
  });

  const { handleKeyDown } = useSearchKeyboard({
    showResults: formState.showResults,
    activeResultIndex: formState.activeResultIndex,
    results,
    dispatch,
    onSelect: handleArtistSelect,
  });

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      dispatch({ type: 'SET_SEARCH_QUERY', payload: value });

      // Check if it's a Spotify URL
      const artistId = extractSpotifyArtistId(value);
      if (artistId) {
        // It's a Spotify URL - connect directly instead of searching
        clear();
        dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
        connectFromUrl(artistId);
        return;
      }

      // Regular search
      search(value);
      dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
    },
    [search, clear, extractSpotifyArtistId, connectFromUrl]
  );

  const onManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleManualSubmit(formState.manualUrl);
    },
    [formState.manualUrl, handleManualSubmit]
  );

  return (
    <div className='flex flex-col items-center justify-center px-4 py-16 text-center'>
      <div className='flex h-12 w-12 items-center justify-center rounded-lg bg-surface-2'>
        <Icon
          name='Disc3'
          className='h-6 w-6 text-tertiary-token'
          aria-hidden='true'
        />
      </div>
      <h3 className='mt-4 text-[13px] font-medium text-primary-token'>
        Connect your music
      </h3>
      <p className='mt-1 max-w-sm text-[13px] text-tertiary-token'>
        Search for your Spotify artist profile to import your releases.
      </p>

      <div className='mt-6 w-full max-w-md'>
        {formState.manualMode ? (
          <form onSubmit={onManualSubmit} className='space-y-3'>
            <div className='relative'>
              <Input
                type='url'
                inputSize='lg'
                placeholder='https://open.spotify.com/artist/...'
                value={formState.manualUrl}
                onChange={e => {
                  dispatch({ type: 'SET_MANUAL_URL', payload: e.target.value });
                }}
                disabled={isPending}
                className='w-full pr-10'
              />
              <div className='absolute right-3 top-1/2 -translate-y-1/2'>
                <SocialIcon
                  platform='spotify'
                  className='h-4 w-4 text-tertiary-token'
                />
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='submit'
                disabled={isPending || !formState.manualUrl.trim()}
                className='flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-white/[0.08] px-3 py-2 text-[13px] font-medium text-primary-token transition-colors hover:bg-white/[0.12] disabled:opacity-50'
              >
                {isPending ? (
                  <>
                    <Icon
                      name='Loader2'
                      className='h-3.5 w-3.5 animate-spin'
                      aria-hidden='true'
                    />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
              <button
                type='button'
                onClick={() => {
                  dispatch({ type: 'RESET_MANUAL_MODE' });
                }}
                className='rounded-md border border-white/[0.08] bg-transparent px-3 py-2 text-[13px] font-medium text-secondary-token transition-colors hover:bg-white/[0.04]'
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <div className='relative'>
            <div
              className={cn(
                'relative flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 transition-colors',
                'focus-within:border-white/[0.16]',
                isPending && 'opacity-50'
              )}
            >
              <SocialIcon
                platform='spotify'
                className='h-4 w-4 shrink-0 text-tertiary-token'
              />
              <Input
                ref={inputRef}
                type='text'
                inputSize='lg'
                placeholder='Search or paste a Spotify artist URL...'
                value={formState.searchQuery}
                onChange={handleSearchInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() =>
                  formState.searchQuery.length >= 2 &&
                  dispatch({ type: 'SET_SHOW_RESULTS', payload: true })
                }
                onBlur={() =>
                  setTimeout(
                    () =>
                      dispatch({ type: 'SET_SHOW_RESULTS', payload: false }),
                    150
                  )
                }
                disabled={isPending}
                autoComplete='off'
                className='border-0 bg-transparent px-0 text-[13px] focus-visible:ring-0 focus-visible:ring-offset-0'
                role='combobox'
                aria-expanded={formState.showResults && results.length > 0}
                aria-controls='artist-search-results'
                aria-activedescendant={
                  formState.activeResultIndex >= 0
                    ? `artist-result-${formState.activeResultIndex}`
                    : undefined
                }
              />
              {(searchState === 'loading' || isPending) && (
                <div className='h-3.5 w-3.5 border-[1.5px] border-tertiary-token border-t-transparent rounded-full animate-spin shrink-0' />
              )}
            </div>

            {formState.showResults && (
              <div className='absolute z-100 w-full mt-1 rounded-lg border border-white/[0.06] bg-surface-2 shadow-[0px_4px_32px_rgba(8,9,10,0.6)] overflow-hidden'>
                {searchState === 'loading' && results.length === 0 && (
                  <div className='p-2 space-y-1'>
                    {Array.from(
                      { length: 3 },
                      (_, i) => `releases-empty-loading-${i + 1}`
                    ).map(key => (
                      <div
                        key={key}
                        className='flex items-center gap-3 px-2 py-1.5 animate-pulse'
                      >
                        <div className='w-8 h-8 rounded-full bg-white/[0.05]' />
                        <div className='flex-1 space-y-1'>
                          <div className='h-3.5 w-28 bg-white/[0.05] rounded' />
                          <div className='h-3 w-16 bg-white/[0.05] rounded' />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {searchState === 'empty' && (
                  <div className='px-3 py-4 text-center'>
                    <p className='text-[13px] text-tertiary-token'>
                      No artists found
                    </p>
                    <button
                      type='button'
                      onClick={() =>
                        dispatch({ type: 'SET_MANUAL_MODE', payload: true })
                      }
                      className='mt-1.5 text-xs text-secondary-token hover:text-primary-token transition-colors'
                    >
                      Add link manually
                    </button>
                  </div>
                )}

                {searchError && (
                  <div className='px-3 py-4 text-center'>
                    <p className='text-[13px] text-red-400'>{searchError}</p>
                    <button
                      type='button'
                      onClick={() =>
                        dispatch({ type: 'SET_MANUAL_MODE', payload: true })
                      }
                      className='mt-1.5 text-xs text-secondary-token hover:text-primary-token transition-colors'
                    >
                      Add link manually
                    </button>
                  </div>
                )}

                {results.length > 0 && (
                  <>
                    <select
                      id='artist-search-results'
                      className='sr-only'
                      size={Math.min(results.length, 5)}
                      aria-label='Spotify artist results'
                      value={
                        formState.activeResultIndex >= 0 &&
                        results[formState.activeResultIndex]
                          ? results[formState.activeResultIndex].id
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
                    </select>
                    <div
                      ref={resultsListRef}
                      className='max-h-64 overflow-y-auto py-1'
                      aria-hidden='true'
                    >
                      {results.map((artist, index) => (
                        <button
                          key={artist.id}
                          type='button'
                          tabIndex={0}
                          className={cn(
                            'flex items-center gap-3 px-2 py-1.5 mx-1 rounded-md cursor-pointer transition-colors border-0 bg-transparent w-[calc(100%-0.5rem)] text-left',
                            index === formState.activeResultIndex
                              ? 'bg-white/[0.06]'
                              : 'hover:bg-white/[0.04]'
                          )}
                          onClick={() => handleArtistSelect(artist)}
                          onKeyDown={event =>
                            handleActivationKeyDown(event, () =>
                              handleArtistSelect(artist)
                            )
                          }
                          onMouseEnter={() =>
                            dispatch({
                              type: 'SET_ACTIVE_RESULT_INDEX',
                              payload: index,
                            })
                          }
                        >
                          <div className='w-8 h-8 rounded-full bg-white/[0.05] overflow-hidden shrink-0 relative'>
                            {artist.imageUrl ? (
                              <Image
                                src={artist.imageUrl}
                                alt={artist.name}
                                fill
                                sizes='32px'
                                className='object-cover'
                                unoptimized
                              />
                            ) : (
                              <div className='w-full h-full flex items-center justify-center'>
                                <SocialIcon
                                  platform='spotify'
                                  className='w-4 h-4 text-tertiary-token'
                                />
                              </div>
                            )}
                          </div>

                          <div className='flex-1 min-w-0'>
                            <div className='text-[13px] font-medium text-primary-token truncate'>
                              {artist.name}
                            </div>
                            {artist.followers && (
                              <div className='text-[11px] text-tertiary-token'>
                                {formatFollowers(artist.followers)}
                              </div>
                            )}
                          </div>

                          {artist.verified && (
                            <div className='shrink-0 text-tertiary-token'>
                              <Icon
                                name='BadgeCheck'
                                className='w-3.5 h-3.5'
                                aria-hidden='true'
                              />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {formState.error && (
          <p className='mt-2 text-[13px] text-red-400' role='alert'>
            {formState.error}
          </p>
        )}

        {!formState.manualMode && (
          <button
            type='button'
            onClick={() => dispatch({ type: 'SET_MANUAL_MODE', payload: true })}
            className='mt-3 text-xs text-tertiary-token hover:text-secondary-token transition-colors'
          >
            Or paste a Spotify artist URL
          </button>
        )}
      </div>
    </div>
  );
}
