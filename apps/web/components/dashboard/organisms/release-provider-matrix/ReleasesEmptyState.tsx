'use client';

import { Input } from '@jovie/ui';
import Image from 'next/image';
import { useCallback, useRef, useState, useTransition } from 'react';
import { connectSpotifyArtist } from '@/app/app/dashboard/releases/actions';
import { Icon } from '@/components/atoms/Icon';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [manualMode, setManualMode] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLUListElement>(null);

  const {
    results,
    state,
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
      setSearchQuery(value);
      setActiveResultIndex(-1);
      setError(null);

      // Check if it's a Spotify URL
      const artistId = extractSpotifyArtistId(value);
      if (artistId) {
        // It's a Spotify URL - connect directly instead of searching
        clear();
        setShowResults(false);
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
              setSearchQuery('');
              onConnected?.(result.releases, result.artistName);
            } else {
              setError(result.message);
            }
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Failed to connect artist'
            );
          }
        });
        return;
      }

      // Regular search
      search(value);
      setShowResults(true);
    },
    [search, clear, extractSpotifyArtistId, onConnected, onImportStart]
  );

  const handleArtistSelect = useCallback(
    (artist: { id: string; name: string; url: string }) => {
      setError(null);

      // Clear the search UI and show importing state immediately
      setSearchQuery('');
      setShowResults(false);
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
            setError(result.message);
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to connect artist'
          );
        }
      });
    },
    [clear, onConnected, onImportStart]
  );

  const handleManualSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmedUrl = manualUrl.trim();
      if (!trimmedUrl) {
        setError('Please enter a Spotify artist URL');
        return;
      }

      // Extract artist ID from URL using the same helper as paste detection
      const artistId = extractSpotifyArtistId(trimmedUrl);
      if (!artistId) {
        setError('Please enter a valid Spotify artist URL');
        return;
      }

      const artistUrl = `https://open.spotify.com/artist/${artistId}`;

      // Clear the form and show importing state
      setManualUrl('');
      setManualMode(false);
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
            setError(result.message);
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to connect artist'
          );
        }
      });
    },
    [manualUrl, onConnected, onImportStart, extractSpotifyArtistId]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showResults || results.length === 0) {
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveResultIndex(prev =>
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveResultIndex(prev =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (activeResultIndex >= 0 && results[activeResultIndex]) {
            handleArtistSelect(results[activeResultIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowResults(false);
          setActiveResultIndex(-1);
          break;
      }
    },
    [activeResultIndex, handleArtistSelect, results, showResults]
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
        {manualMode ? (
          <form onSubmit={handleManualSubmit} className='space-y-3'>
            <div className='relative'>
              <Input
                type='url'
                inputSize='lg'
                placeholder='https://open.spotify.com/artist/...'
                value={manualUrl}
                onChange={e => {
                  setManualUrl(e.target.value);
                  setError(null);
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
                disabled={isPending || !manualUrl.trim()}
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
                  setManualMode(false);
                  setManualUrl('');
                  setError(null);
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
                value={searchQuery}
                onChange={handleSearchInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
                onBlur={() => setTimeout(() => setShowResults(false), 150)}
                disabled={isPending}
                autoComplete='off'
                className='border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0'
                role='combobox'
                aria-expanded={showResults && results.length > 0}
                aria-controls='artist-search-results'
                aria-activedescendant={
                  activeResultIndex >= 0
                    ? `artist-result-${activeResultIndex}`
                    : undefined
                }
              />
              {(state === 'loading' || isPending) && (
                <div className='h-4 w-4 border-2 border-tertiary-token border-t-transparent rounded-full animate-spin' />
              )}
            </div>

            {showResults && (
              <div className='absolute z-100 w-full mt-2 rounded-xl border border-subtle bg-surface-1 shadow-lg overflow-hidden'>
                {state === 'loading' && results.length === 0 && (
                  <div className='p-3 space-y-2'>
                    {[...Array(3)].map((_, i) => (
                      <div
                        key={i}
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

                {state === 'empty' && (
                  <div className='p-4 text-center'>
                    <p className='text-sm text-secondary-token'>
                      No artists found
                    </p>
                    <button
                      type='button'
                      onClick={() => setManualMode(true)}
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
                      onClick={() => setManualMode(true)}
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
                        aria-selected={index === activeResultIndex}
                        className={cn(
                          'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                          index === activeResultIndex
                            ? 'bg-surface-2'
                            : 'hover:bg-surface-2/50'
                        )}
                        onClick={() => handleArtistSelect(artist)}
                        onMouseEnter={() => setActiveResultIndex(index)}
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

        {error && (
          <p className='mt-2 text-sm text-red-500' role='alert'>
            {error}
          </p>
        )}

        {!manualMode && (
          <button
            type='button'
            onClick={() => setManualMode(true)}
            className='mt-3 text-xs text-tertiary-token hover:text-secondary-token transition-colors'
          >
            Or paste a Spotify artist URL
          </button>
        )}
      </div>
    </div>
  );
}
