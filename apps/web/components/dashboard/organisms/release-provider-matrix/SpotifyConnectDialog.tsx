'use client';

import { BadgeCheck, Link2, Search } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  Dialog,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import {
  formatFollowers,
  initialState,
  releasesEmptyStateReducer,
  useSpotifyConnect,
} from './releases-empty-state';

const LOADING_SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'];
const DEFAULT_PLACEHOLDER = 'Search your artist name or paste a Spotify link';
const PASTE_PLACEHOLDER = 'Paste your Spotify artist URL here';

function isSpotifyUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://open.spotify.com/') ||
    trimmed.startsWith('open.spotify.com/') ||
    trimmed.startsWith('spotify.com/')
  );
}

interface SpotifyConnectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConnected?: (
    releases: ReleaseViewModel[],
    artistName: string
  ) => void;
  readonly onImportStart?: (artistName: string) => void;
}

export function SpotifyConnectDialog({
  open,
  onOpenChange,
  onConnected,
  onImportStart,
}: SpotifyConnectDialogProps) {
  const [formState, dispatch] = useReducer(
    releasesEmptyStateReducer,
    initialState
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleConnected = useCallback(
    (releases: ReleaseViewModel[], artistName: string) => {
      onConnected?.(releases, artistName);
      onOpenChange(false);
    },
    [onConnected, onOpenChange]
  );

  const {
    isPending,
    extractSpotifyArtistId,
    connectFromUrl,
    handleArtistSelect,
  } = useSpotifyConnect({
    dispatch,
    searchClear: clear,
    onConnected: handleConnected,
    onImportStart,
  });

  const totalItems = results.length + 1;
  const pasteUrlIndex = results.length;

  useEffect(() => {
    if (!open) return;
    dispatch({ type: 'RESET_STATE' });
    clear();
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    if (inputRef.current) {
      inputRef.current.placeholder = DEFAULT_PLACEHOLDER;
    }
    return () => clearTimeout(timer);
  }, [open, clear]);

  useEffect(() => {
    if (
      formState.activeResultIndex >= 0 &&
      formState.activeResultIndex < results.length &&
      resultsListRef.current
    ) {
      const activeItem = resultsListRef.current.children[
        formState.activeResultIndex
      ] as HTMLElement;
      activeItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [formState.activeResultIndex, results.length]);

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      dispatch({ type: 'SET_SEARCH_QUERY', payload: value });

      if (isSpotifyUrl(value)) {
        dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
        return;
      }

      search(value);
      dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
    },
    [search]
  );

  const handlePasteUrlClick = useCallback(() => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: '' });
    dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
    dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
    dispatch({ type: 'SET_ERROR', payload: null });
    clear();
    if (inputRef.current) {
      inputRef.current.placeholder = PASTE_PLACEHOLDER;
      inputRef.current.focus();
    }
  }, [clear]);

  const handleClaimArtist = useCallback(() => {
    if (isPending) return;
    const query = formState.searchQuery.trim();
    if (!query) return;

    dispatch({ type: 'SET_ERROR', payload: null });

    if (isSpotifyUrl(query)) {
      const artistId = extractSpotifyArtistId(query);
      if (!artistId) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Please enter a valid Spotify artist URL',
        });
        return;
      }
      connectFromUrl(artistId);
      return;
    }

    const activeArtist =
      formState.activeResultIndex >= 0 &&
      formState.activeResultIndex < results.length
        ? results[formState.activeResultIndex]
        : undefined;
    const fallbackArtist = results[0];
    const nextArtist = activeArtist ?? fallbackArtist;

    if (nextArtist) {
      handleArtistSelect(nextArtist);
      return;
    }

    dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
    inputRef.current?.focus();
  }, [
    connectFromUrl,
    extractSpotifyArtistId,
    formState.activeResultIndex,
    formState.searchQuery,
    handleArtistSelect,
    isPending,
    results,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === 'Enter' &&
        !formState.showResults &&
        formState.searchQuery
      ) {
        e.preventDefault();
        handleClaimArtist();
        return;
      }

      if (!formState.showResults) {
        if (e.key === 'Escape') {
          e.preventDefault();
          dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload:
              formState.activeResultIndex < totalItems - 1
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
                : totalItems - 1,
          });
          break;
        case 'Enter':
          e.preventDefault();
          if (
            formState.activeResultIndex >= 0 &&
            formState.activeResultIndex < results.length
          ) {
            const artist = results[formState.activeResultIndex];
            if (artist) handleArtistSelect(artist);
          } else if (formState.activeResultIndex === pasteUrlIndex) {
            handlePasteUrlClick();
          } else {
            handleClaimArtist();
          }
          break;
        case 'Escape':
          e.preventDefault();
          dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
          dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
          break;
        case 'Tab':
          dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
          dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
          break;
      }
    },
    [
      formState.activeResultIndex,
      formState.searchQuery,
      formState.showResults,
      handleClaimArtist,
      handleArtistSelect,
      handlePasteUrlClick,
      pasteUrlIndex,
      results,
      totalItems,
    ]
  );

  const shouldShowDropdown = useMemo(() => {
    if (!formState.showResults) return false;
    if (searchState === 'loading') return true;
    if (searchState === 'empty' || searchState === 'error') return true;
    if (results.length > 0) return true;
    return formState.searchQuery.length >= 1;
  }, [
    formState.searchQuery.length,
    formState.showResults,
    results.length,
    searchState,
  ]);

  const trimmedQuery = formState.searchQuery.trim();
  const isLoading = searchState === 'loading';
  const showClaimButton = Boolean(trimmedQuery);
  const claimButtonDisabled =
    isPending ||
    (isLoading && !isSpotifyUrl(trimmedQuery)) ||
    (!isSpotifyUrl(trimmedQuery) && results.length === 0);

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} size='lg'>
      <div className='space-y-4 p-6'>
        <div className='space-y-1'>
          <DialogTitle className='text-lg font-semibold text-primary-token'>
            Connect Spotify
          </DialogTitle>
          <DialogDescription className='text-sm text-secondary-token'>
            Search for your artist profile to import releases.
          </DialogDescription>
        </div>

        <div ref={containerRef} className='relative'>
          <label htmlFor='spotify-connect-search' className='sr-only'>
            Search Spotify artists or paste a link
          </label>
          <div
            className={cn(
              'w-full flex items-center gap-3 rounded-xl border px-4 py-3 min-h-12 bg-surface-0',
              'transition-all duration-200',
              shouldShowDropdown
                ? 'border-focus ring-2 ring-focus/20'
                : 'border-strong hover:border-focus',
              isPending && 'opacity-60'
            )}
          >
            <div className='flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-brand-spotify-subtle'>
              <SocialIcon
                platform='spotify'
                className='w-3.5 h-3.5 text-brand-spotify'
              />
            </div>
            <input
              ref={inputRef}
              id='spotify-connect-search'
              type='text'
              value={formState.searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (
                  formState.searchQuery.trim().length >= 1 &&
                  !isSpotifyUrl(formState.searchQuery)
                ) {
                  dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
                }
              }}
              onBlur={e => {
                if (containerRef.current?.contains(e.relatedTarget as Node))
                  return;
                dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
                dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
              }}
              placeholder={DEFAULT_PLACEHOLDER}
              autoCapitalize='none'
              autoCorrect='off'
              autoComplete='off'
              disabled={isPending}
              className='min-w-0 flex-1 bg-transparent text-sm text-primary-token focus-visible:outline-none'
              role='combobox'
              aria-expanded={shouldShowDropdown}
              aria-controls='spotify-connect-results'
              aria-activedescendant={
                formState.activeResultIndex >= 0
                  ? `spotify-connect-result-${formState.activeResultIndex}`
                  : undefined
              }
            />
            {showClaimButton ? (
              <button
                type='button'
                disabled={claimButtonDisabled}
                onClick={handleClaimArtist}
                className={cn(
                  'shrink-0 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors focus-ring-themed',
                  claimButtonDisabled
                    ? 'bg-btn-primary/50 text-btn-primary-foreground/60 cursor-not-allowed'
                    : 'bg-btn-primary text-btn-primary-foreground'
                )}
              >
                {(isLoading || isPending) && (
                  <div className='w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-none' />
                )}
                Connect Spotify
              </button>
            ) : isPending ? (
              <div className='w-4 h-4 border-[1.5px] border-tertiary-token border-t-transparent rounded-full animate-spin shrink-0' />
            ) : (
              <Search className='w-4 h-4 shrink-0 text-tertiary-token' />
            )}
          </div>

          {formState.error && (
            <p className='mt-2 text-sm text-red-400' role='alert'>
              {formState.error}
            </p>
          )}

          {shouldShowDropdown && (
            <div className='absolute z-50 w-full mt-2 rounded-xl border border-default overflow-hidden bg-surface-0 shadow-lg'>
              <select
                id='spotify-connect-results'
                className='sr-only'
                size={Math.min(totalItems, 6)}
                aria-label='Spotify artist results'
                value={
                  formState.activeResultIndex === pasteUrlIndex
                    ? '__paste__'
                    : (results[formState.activeResultIndex]?.id ?? '')
                }
                onChange={event => {
                  if (event.target.value === '__paste__') {
                    handlePasteUrlClick();
                    return;
                  }
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
                    id={`spotify-connect-result-${index}`}
                    value={artist.id}
                  >
                    {artist.name}
                    {artist.followers
                      ? ` — ${formatFollowers(artist.followers)}`
                      : ''}
                  </option>
                ))}
                <option
                  id={`spotify-connect-result-${pasteUrlIndex}`}
                  value='__paste__'
                >
                  Paste a Spotify URL instead
                </option>
              </select>

              {searchState === 'loading' && results.length === 0 && (
                <div className='p-3 space-y-2'>
                  {LOADING_SKELETON_KEYS.map(key => (
                    <div
                      key={key}
                      className='flex items-center gap-3 animate-pulse'
                    >
                      <div className='w-10 h-10 rounded-full bg-surface-1' />
                      <div className='flex-1 space-y-1'>
                        <div className='h-4 w-32 rounded bg-surface-1' />
                        <div className='h-3 w-20 rounded bg-surface-1' />
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
                </div>
              )}

              {searchState === 'error' && (
                <div className='p-4 text-center'>
                  <p className='text-sm text-error'>
                    {searchError || 'Search failed. Try again.'}
                  </p>
                </div>
              )}

              {results.length > 0 && (
                <div
                  ref={resultsListRef}
                  className='max-h-64 overflow-y-auto'
                  aria-hidden='true'
                >
                  {results.map((artist, index) => (
                    <button
                      key={artist.id}
                      type='button'
                      tabIndex={0}
                      className={cn(
                        'flex items-center gap-3 p-3 cursor-pointer transition-colors border-0 bg-transparent w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 focus-visible:ring-inset',
                        index === formState.activeResultIndex && 'bg-surface-1'
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
                      <div className='w-10 h-10 rounded-full overflow-hidden shrink-0 relative bg-surface-1'>
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
                        <div className='font-medium truncate text-sm text-primary-token'>
                          {artist.name}
                        </div>
                        {artist.followers && (
                          <div className='text-xs text-tertiary-token'>
                            {formatFollowers(artist.followers)}
                          </div>
                        )}
                      </div>
                      {artist.verified && (
                        <div
                          className='shrink-0 text-brand-spotify'
                          data-testid='verified-badge'
                        >
                          <BadgeCheck className='h-4 w-4' aria-hidden='true' />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <button
                type='button'
                tabIndex={0}
                className={cn(
                  'flex items-center gap-3 p-3 cursor-pointer transition-colors bg-transparent w-full text-left border-t border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 focus-visible:ring-inset',
                  formState.activeResultIndex === pasteUrlIndex &&
                    'bg-surface-1'
                )}
                onClick={handlePasteUrlClick}
                onKeyDown={event =>
                  handleActivationKeyDown(event, () => handlePasteUrlClick())
                }
                onMouseEnter={() =>
                  dispatch({
                    type: 'SET_ACTIVE_RESULT_INDEX',
                    payload: pasteUrlIndex,
                  })
                }
              >
                <div className='w-10 h-10 rounded-full flex items-center justify-center bg-surface-1'>
                  <Link2
                    className='h-5 w-5 text-tertiary-token'
                    aria-hidden='true'
                  />
                </div>
                <div className='flex-1'>
                  <div className='font-medium text-sm text-primary-token'>
                    Paste a Spotify URL instead
                  </div>
                  <div className='text-xs text-tertiary-token'>
                    open.spotify.com/artist/...
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
