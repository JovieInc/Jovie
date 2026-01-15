'use client';

import { Input } from '@jovie/ui';
import Image from 'next/image';
import { useCallback, useReducer, useRef, useTransition } from 'react';
import { connectSpotifyArtist } from '@/app/app/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

interface ReleasesEmptyStateState {
  searchQuery: string;
  showResults: boolean;
  activeResultIndex: number;
  manualMode: boolean;
  manualUrl: string;
  error: string | null;
}

type ReleasesEmptyStateAction =
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SHOW_RESULTS'; payload: boolean }
  | { type: 'SET_ACTIVE_RESULT_INDEX'; payload: number }
  | { type: 'SET_MANUAL_MODE'; payload: boolean }
  | { type: 'SET_MANUAL_URL'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'RESET_MANUAL_MODE' };

function releasesEmptyStateReducer(
  state: ReleasesEmptyStateState,
  action: ReleasesEmptyStateAction
): ReleasesEmptyStateState {
  switch (action.type) {
    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        searchQuery: action.payload,
        activeResultIndex: -1,
        error: null,
      };
    case 'SET_SHOW_RESULTS':
      return { ...state, showResults: action.payload };
    case 'SET_ACTIVE_RESULT_INDEX':
      return { ...state, activeResultIndex: action.payload };
    case 'SET_MANUAL_MODE':
      return { ...state, manualMode: action.payload };
    case 'SET_MANUAL_URL':
      return { ...state, manualUrl: action.payload, error: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_SEARCH':
      return { ...state, searchQuery: '', showResults: false };
    case 'RESET_MANUAL_MODE':
      return { ...state, manualUrl: '', manualMode: false, error: null };
    default:
      return state;
  }
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M followers`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K followers`;
  }
  return `${count} followers`;
}

interface ReleasesEmptyStateProps {
  onConnected?: (releases: ReleaseViewModel[], artistName: string) => void;
  onImportStart?: (artistName: string) => void;
}

export function ReleasesEmptyState({
  onConnected,
  onImportStart,
}: ReleasesEmptyStateProps) {
  const [formState, dispatch] = useReducer(releasesEmptyStateReducer, {
    searchQuery: '',
    showResults: false,
    activeResultIndex: -1,
    manualMode: false,
    manualUrl: '',
    error: null,
  });

  const [isPending, startTransition] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLUListElement>(null);

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

  // Check if a string is a Spotify artist URL and extract the ID
  const extractSpotifyArtistId = useCallback((input: string): string | null => {
    const trimmed = input.trim();
    const artistMatch = trimmed.match(
      /(?:open\.)?spotify\.com\/artist\/([a-zA-Z0-9]{22})/
    );
    return artistMatch ? artistMatch[1] : null;
  }, []);

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
        const artistUrl = `https://open.spotify.com/artist/${artistId}`;
        onImportStart?.('');

        startTransition(async () => {
          try {
            const result = await connectSpotifyArtist({
              spotifyArtistId: artistId,
              spotifyArtistUrl: artistUrl,
              artistName: '',
            });

            if (result.success) {
              dispatch({ type: 'CLEAR_SEARCH' });
              onConnected?.(result.releases, result.artistName);
            } else {
              dispatch({ type: 'SET_ERROR', payload: result.message });
            }
          } catch (err) {
            dispatch({
              type: 'SET_ERROR',
              payload:
                err instanceof Error ? err.message : 'Failed to connect artist',
            });
          }
        });
        return;
      }

      // Regular search
      search(value);
      dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
    },
    [search, clear, extractSpotifyArtistId, onConnected, onImportStart]
  );

  const handleArtistSelect = useCallback(
    (artist: { id: string; name: string; url: string }) => {
      dispatch({ type: 'SET_ERROR', payload: null });

      // Clear the search UI and show importing state immediately
      dispatch({ type: 'CLEAR_SEARCH' });
      clear();
      onImportStart?.(artist.name);

      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artist.id,
            spotifyArtistUrl: artist.url,
            artistName: artist.name,
          });

          if (result.success) {
            onConnected?.(result.releases, result.artistName);
          } else {
            dispatch({ type: 'SET_ERROR', payload: result.message });
          }
        } catch (err) {
          dispatch({
            type: 'SET_ERROR',
            payload:
              err instanceof Error ? err.message : 'Failed to connect artist',
          });
        }
      });
    },
    [clear, onConnected, onImportStart]
  );

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      dispatch({ type: 'SET_ERROR', payload: null });

      const trimmedUrl = formState.manualUrl.trim();
      if (!trimmedUrl) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Please enter a Spotify artist URL',
        });
        return;
      }

      // Extract artist ID from URL using the same helper as paste detection
      const artistId = extractSpotifyArtistId(trimmedUrl);
      if (!artistId) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Please enter a valid Spotify artist URL',
        });
        return;
      }

      const artistUrl = `https://open.spotify.com/artist/${artistId}`;

      // Clear the form and show importing state
      dispatch({ type: 'RESET_MANUAL_MODE' });
      onImportStart?.('');

      startTransition(async () => {
        try {
          const result = await connectSpotifyArtist({
            spotifyArtistId: artistId,
            spotifyArtistUrl: artistUrl,
            artistName: '', // Will be empty for manual mode
          });

          if (result.success) {
            onConnected?.(result.releases, result.artistName);
          } else {
            dispatch({ type: 'SET_ERROR', payload: result.message });
          }
        } catch (err) {
          dispatch({
            type: 'SET_ERROR',
            payload:
              err instanceof Error ? err.message : 'Failed to connect artist',
          });
        }
      });
    },
    [formState.manualUrl, onConnected, onImportStart, extractSpotifyArtistId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!formState.showResults || results.length === 0) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload:
              formState.activeResultIndex < results.length - 1
                ? formState.activeResultIndex + 1
                : 0,
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload:
              formState.activeResultIndex > 0
                ? formState.activeResultIndex - 1
                : results.length - 1,
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (
            formState.activeResultIndex >= 0 &&
            results[formState.activeResultIndex]
          ) {
            handleArtistSelect(results[formState.activeResultIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
          dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
          break;
      }
    },
    [
      formState.activeResultIndex,
      formState.showResults,
      handleArtistSelect,
      results,
    ]
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
          <form onSubmit={handleManualSubmit} className='space-y-3'>
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

                {results.length > 0 && (
                  <ul
                    ref={resultsListRef}
                    id='artist-search-results'
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: listbox role on ul is correct for ARIA combobox pattern
                    role='listbox'
                    className='max-h-64 overflow-y-auto'
                  >
                    {results.map((artist, index) => (
                      // biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard navigation handled by parent input with arrow keys
                      <li
                        key={artist.id}
                        id={`artist-result-${index}`}
                        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: option role on li is correct for ARIA listbox pattern
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
                      </li>
                    ))}
                  </ul>
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
