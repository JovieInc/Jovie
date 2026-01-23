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
  onConnected?: (releases: ReleaseViewModel[], artistName: string) => void;
  onImportStart?: (artistName: string) => void;
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
    <div className='flex flex-col items-center justify-center px-4 py-16 text-center sm:px-6'>
      <div className='flex h-16 w-16 items-center justify-center rounded-full bg-surface-2'>
        <Icon
          name='Disc3'
          className='h-8 w-8 text-tertiary-token'
          aria-hidden='true'
        />
      </div>
      <h3 className='mt-4 text-lg font-semibold text-primary-token'>
        Connect your music
      </h3>
      <p className='mt-1 max-w-sm text-sm text-secondary-token'>
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
                  className='h-5 w-5 text-brand-spotify'
                />
              </div>
            </div>
            <div className='flex items-center gap-2'>
              <button
                type='submit'
                disabled={isPending || !formState.manualUrl.trim()}
                className='flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-spotify px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-spotify-hover disabled:opacity-50'
              >
                {isPending ? (
                  <>
                    <Icon
                      name='Loader2'
                      className='h-4 w-4 animate-spin'
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
                className='rounded-lg border border-subtle bg-surface-1 px-4 py-2 text-sm font-medium text-secondary-token transition-colors hover:bg-surface-2'
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <div className='relative'>
            <div
              className={cn(
                'relative flex w-full items-center gap-2 rounded-xl border bg-surface-1 px-3 py-2 shadow-sm transition-colors',
                'focus-within:ring-2 focus-within:ring-brand-spotify/50 focus-within:border-brand-spotify',
                isPending && 'opacity-50'
              )}
            >
              <div className='flex h-8 w-8 items-center justify-center rounded-full bg-brand-spotify-subtle'>
                <SocialIcon
                  platform='spotify'
                  className='h-4 w-4 text-brand-spotify'
                />
              </div>
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
                className='border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0'
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
                <div className='h-4 w-4 border-2 border-tertiary-token border-t-transparent rounded-full animate-spin' />
              )}
            </div>

            {formState.showResults && (
              <div className='absolute z-100 w-full mt-2 rounded-xl border border-subtle bg-surface-1 shadow-lg overflow-hidden'>
                {searchState === 'loading' && results.length === 0 && (
                  <div className='p-3 space-y-2'>
                    {Array.from(
                      { length: 3 },
                      (_, i) => `releases-empty-loading-${i + 1}`
                    ).map(key => (
                      <div
                        key={key}
                        className='flex items-center gap-3 animate-pulse'
                      >
                        <div className='w-10 h-10 rounded-full bg-surface-3' />
                        <div className='flex-1 space-y-1'>
                          <div className='h-4 w-32 bg-surface-3 rounded' />
                          <div className='h-3 w-20 bg-surface-3 rounded' />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {searchState === 'empty' && (
                  <div className='p-4 text-center'>
                    <p className='text-sm text-secondary-token'>
                      No artists found
                    </p>
                    <button
                      type='button'
                      onClick={() =>
                        dispatch({ type: 'SET_MANUAL_MODE', payload: true })
                      }
                      className='mt-2 text-xs text-accent hover:underline'
                    >
                      Add link manually
                    </button>
                  </div>
                )}

                {searchError && (
                  <div className='p-4 text-center'>
                    <p className='text-sm text-red-500'>{searchError}</p>
                    <button
                      type='button'
                      onClick={() =>
                        dispatch({ type: 'SET_MANUAL_MODE', payload: true })
                      }
                      className='mt-2 text-xs text-accent hover:underline'
                    >
                      Add link manually
                    </button>
                  </div>
                )}

                {/* NOSONAR S6819: Custom autocomplete requires ARIA listbox pattern; native <select> can't support search or custom styling */}
                {results.length > 0 && (
                  <div
                    ref={resultsListRef}
                    id='artist-search-results'
                    role='listbox'
                    className='max-h-64 overflow-y-auto'
                  >
                    {/* NOSONAR S6819: Custom option with rich content; native <option> can't render images */}
                    {results.map((artist, index) => (
                      <div
                        key={artist.id}
                        id={`artist-result-${index}`}
                        role='option'
                        tabIndex={-1}
                        aria-selected={index === formState.activeResultIndex}
                        className={cn(
                          'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                          index === formState.activeResultIndex
                            ? 'bg-surface-2'
                            : 'hover:bg-surface-2/50'
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
                        <div className='w-10 h-10 rounded-full bg-surface-3 overflow-hidden shrink-0 relative'>
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

                        <div className='flex-1 min-w-0'>
                          <div className='font-medium text-primary-token truncate'>
                            {artist.name}
                          </div>
                          {artist.followers && (
                            <div className='text-xs text-tertiary-token'>
                              {formatFollowers(artist.followers)}
                            </div>
                          )}
                        </div>

                        {artist.verified && (
                          <div className='shrink-0 text-brand-spotify'>
                            <svg
                              className='w-4 h-4'
                              viewBox='0 0 20 20'
                              fill='currentColor'
                              aria-hidden='true'
                            >
                              <path
                                fillRule='evenodd'
                                d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                                clipRule='evenodd'
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {formState.error && (
          <p className='mt-2 text-sm text-red-500' role='alert'>
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
