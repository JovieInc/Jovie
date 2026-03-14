'use client';

import { BadgeCheck, Link2, Search } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  Dialog,
  DialogBody,
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
  type SpotifyArtist,
  useSpotifyConnect,
} from './releases-empty-state';

const LOADING_SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'];
const DEFAULT_PLACEHOLDER = 'Search your artist name or paste a Spotify link';
const PASTE_PLACEHOLDER = 'Paste your Spotify artist URL here';

function SearchDropdownState({
  message,
  tone = 'default',
}: {
  readonly message: string;
  readonly tone?: 'default' | 'error';
}) {
  return (
    <div
      className='p-3'
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? undefined : 'polite'}
      aria-atomic='true'
    >
      <DrawerSurfaceCard className='flex min-h-[64px] items-center rounded-[10px] px-3'>
        <p
          className={cn(
            'text-[12px] leading-[17px]',
            tone === 'error' ? 'text-error' : 'text-(--linear-text-secondary)'
          )}
        >
          {message}
        </p>
      </DrawerSurfaceCard>
    </div>
  );
}

function SearchResultsLoadingSkeleton() {
  return (
    <output
      className='block p-3 space-y-1.5'
      aria-live='polite'
      aria-label='Loading Spotify artist results'
      aria-busy='true'
    >
      {LOADING_SKELETON_KEYS.map(key => (
        <DrawerSurfaceCard
          key={key}
          className='flex min-h-[64px] items-center gap-3 rounded-[10px] px-3'
          aria-hidden='true'
        >
          <div className='h-10 w-10 shrink-0 rounded-full skeleton' />
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='h-3.5 w-32 rounded skeleton' />
            <div className='h-2.5 w-20 rounded skeleton' />
          </div>
          <div className='h-4 w-4 shrink-0 rounded-full skeleton' />
        </DrawerSurfaceCard>
      ))}
    </output>
  );
}

function handleEnterInResults(
  activeIndex: number,
  results: SpotifyArtist[],
  pasteUrlIndex: number,
  onArtistSelect: (artist: SpotifyArtist) => void,
  onPasteUrl: () => void,
  onClaimArtist: () => void
) {
  const isArtistSelected = activeIndex >= 0 && activeIndex < results.length;
  if (isArtistSelected) {
    const artist = results[activeIndex];
    if (artist) onArtistSelect(artist);
    return;
  }
  if (activeIndex === pasteUrlIndex) {
    onPasteUrl();
    return;
  }
  onClaimArtist();
}

function isSpotifyUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://open.spotify.com/') ||
    trimmed.startsWith('open.spotify.com/') ||
    trimmed.startsWith('spotify.com/')
  );
}

function SearchInputTrailing({
  showClaimButton,
  claimButtonDisabled,
  isLoading,
  isPending,
  onClaimArtist,
}: {
  readonly showClaimButton: boolean;
  readonly claimButtonDisabled: boolean;
  readonly isLoading: boolean;
  readonly isPending: boolean;
  readonly onClaimArtist: () => void;
}) {
  if (showClaimButton) {
    return (
      <DrawerButton
        type='button'
        tone='primary'
        disabled={claimButtonDisabled}
        onClick={onClaimArtist}
        className={cn(
          'h-8 shrink-0 px-3 text-[13px]',
          claimButtonDisabled && 'text-white/60'
        )}
      >
        {(isLoading || isPending) && (
          <LoadingSpinner size='sm' tone='inverse' label='Connecting' />
        )}
        Connect Spotify
      </DrawerButton>
    );
  }

  if (isPending) {
    return <LoadingSpinner size='sm' tone='muted' label='Loading' />;
  }

  return (
    <Search
      className='h-4 w-4 shrink-0 text-(--linear-text-tertiary)'
      aria-hidden='true'
    />
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
          handleEnterInResults(
            formState.activeResultIndex,
            results,
            pasteUrlIndex,
            handleArtistSelect,
            handlePasteUrlClick,
            handleClaimArtist
          );
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
      <DialogTitle className='text-lg font-[590] text-(--linear-text-primary)'>
        Connect Spotify
      </DialogTitle>
      <DialogDescription className='text-[13px] text-(--linear-text-secondary)'>
        Search for your artist profile to import releases.
      </DialogDescription>

      <DialogBody className='space-y-4'>
        <div className='space-y-1'>
          <p className='text-[13px] text-(--linear-text-secondary)'>
            Search by artist name or paste your Spotify artist URL to connect
            instantly.
          </p>
        </div>

        <div ref={containerRef} className='relative'>
          <label htmlFor='spotify-connect-search' className='sr-only'>
            Search Spotify artists or paste a link
          </label>
          <div
            className={cn(
              'flex min-h-12 w-full items-center gap-3 rounded-xl border border-(--linear-border-default) bg-(--linear-bg-surface-0) px-4 py-3',
              'transition-all duration-200',
              shouldShowDropdown
                ? 'border-(--linear-border-focus) ring-2 ring-(--linear-border-focus)/20'
                : 'hover:border-(--linear-border-focus)',
              isPending && 'opacity-60'
            )}
          >
            <div className='flex items-center justify-center w-6 h-6 rounded-full shrink-0 bg-brand-spotify-subtle'>
              <ProviderIcon provider='spotify' className='h-3.5 w-3.5' />
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
              className='min-w-0 flex-1 bg-transparent text-[13px] text-(--linear-text-primary) focus-visible:outline-none'
              role='combobox'
              aria-expanded={shouldShowDropdown}
              aria-controls='spotify-connect-results'
              aria-activedescendant={
                formState.activeResultIndex >= 0
                  ? `spotify-connect-result-${formState.activeResultIndex}`
                  : undefined
              }
            />
            <SearchInputTrailing
              showClaimButton={showClaimButton}
              claimButtonDisabled={claimButtonDisabled}
              isLoading={isLoading}
              isPending={isPending}
              onClaimArtist={handleClaimArtist}
            />
          </div>

          {formState.error && (
            <p className='mt-2 text-[13px] text-error' role='alert'>
              {formState.error}
            </p>
          )}

          {shouldShowDropdown && (
            <div className='absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-(--linear-border-default) bg-(--linear-bg-surface-0) shadow-[var(--linear-shadow-card-elevated)]'>
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
                <SearchResultsLoadingSkeleton />
              )}

              {searchState === 'empty' && (
                <SearchDropdownState message='No artists found' />
              )}

              {searchState === 'error' && (
                <SearchDropdownState
                  message={searchError || 'Search failed. Try again.'}
                  tone='error'
                />
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
                        'flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 focus-visible:ring-inset',
                        index === formState.activeResultIndex &&
                          'bg-(--linear-bg-surface-1)'
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
                      <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-(--linear-bg-surface-1)'>
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
                            <ProviderIcon
                              provider='spotify'
                              className='h-5 w-5'
                            />
                          </div>
                        )}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <div className='truncate text-[13px] font-[510] text-(--linear-text-primary)'>
                          {artist.name}
                        </div>
                        {artist.followers && (
                          <div className='text-[11px] text-(--linear-text-tertiary)'>
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
                  'flex w-full cursor-pointer items-center gap-3 border-t border-(--linear-border-subtle) bg-transparent p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20 focus-visible:ring-inset',
                  formState.activeResultIndex === pasteUrlIndex &&
                    'bg-(--linear-bg-surface-1)'
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
                <div className='flex h-10 w-10 items-center justify-center rounded-full bg-(--linear-bg-surface-1)'>
                  <Link2
                    className='h-5 w-5 text-(--linear-text-tertiary)'
                    aria-hidden='true'
                  />
                </div>
                <div className='flex-1'>
                  <div className='text-[13px] font-[510] text-(--linear-text-primary)'>
                    Paste a Spotify URL instead
                  </div>
                  <div className='text-[11px] text-(--linear-text-tertiary)'>
                    open.spotify.com/artist/...
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
}
