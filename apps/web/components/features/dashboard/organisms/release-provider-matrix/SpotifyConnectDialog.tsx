'use client';

import {
  Button,
  InlineOfflineNotice,
  Input,
  Kbd,
  Spinner as LoadingSpinner,
} from '@jovie/ui';
import { BadgeCheck, Search } from 'lucide-react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import type { ReleaseViewModel } from '@/lib/discography/types';
import {
  type SpotifyArtistResult as SpotifyArtist,
  useArtistSearchQuery,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  formatFollowers,
  initialState,
  releasesEmptyStateReducer,
  useSpotifyConnect,
} from './releases-empty-state';

const LOADING_SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'];
const DEFAULT_PLACEHOLDER = 'Search your artist name or paste a Spotify link';
const RESULTS_ID = 'spotify-connect-results';
const HINTS_ID = 'spotify-connect-keyboard-hints';

function SearchDropdownState({
  message,
  tone = 'default',
  onRetry,
  onEscapeHatch,
}: {
  readonly message: string;
  readonly tone?: 'default' | 'error';
  readonly onRetry?: () => void;
  readonly onEscapeHatch: () => void;
}) {
  return (
    <div className='flex flex-wrap items-center gap-2 py-2 pl-1'>
      <p
        className={cn(
          'min-w-0 flex-1 text-xs',
          tone === 'error' ? 'text-error' : 'text-secondary-token'
        )}
        role={tone === 'error' ? 'alert' : undefined}
      >
        {message}
      </p>
      {onRetry && (
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={onRetry}
          data-testid='spotify-connect-retry'
        >
          Retry
        </Button>
      )}
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onEscapeHatch}
        data-testid='spotify-connect-paste-hatch'
      >
        {/* ui-casing-allow: sentence case per owner decision JOV-8975 (2026-10-23) */}
        Paste a Spotify artist link
      </Button>
    </div>
  );
}

function SearchResultsLoadingSkeleton() {
  return (
    <output
      className='block space-y-1 p-2.5'
      aria-live='polite'
      aria-label='Loading Spotify Artist Results'
      aria-busy='true'
    >
      {LOADING_SKELETON_KEYS.map(key => (
        <div
          key={key}
          className='flex items-center gap-2.5 px-2.5 py-2'
          aria-hidden='true'
        >
          <div className='h-10 w-10 shrink-0 rounded-full skeleton' />
          <div className='min-w-0 flex-1 space-y-1.5'>
            <div className='h-3.5 w-32 rounded skeleton' />
            <div className='h-2.5 w-20 rounded skeleton' />
          </div>
        </div>
      ))}
    </output>
  );
}

function canSelectArtist(artist: SpotifyArtist): boolean {
  return !artist.isClaimed || artist.isClaimedByCurrentUser === true;
}

function getNextSelectableIndex(
  activeIndex: number,
  direction: 1 | -1,
  results: SpotifyArtist[]
): number {
  const startIndex =
    activeIndex >= 0 ? activeIndex : direction === 1 ? -1 : results.length;
  for (let offset = 1; offset <= results.length; offset += 1) {
    const nextIndex =
      (startIndex + direction * offset + results.length) % results.length;
    if (results[nextIndex] && canSelectArtist(results[nextIndex])) {
      return nextIndex;
    }
  }
  return -1;
}

function isSpotifyUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://open.spotify.com/') ||
    trimmed.startsWith('open.spotify.com/') ||
    trimmed.startsWith('spotify.com/')
  );
}

const KEYBOARD_HINTS = [
  ['Up / Down', 'to move'],
  ['Enter', 'to select'],
  ['Esc', 'to close'],
];

function SearchKeyboardHints() {
  return (
    <p
      id={HINTS_ID}
      className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-tertiary-token'
    >
      {KEYBOARD_HINTS.map(([key, hint]) => (
        <span key={key} className='inline-flex items-center gap-1'>
          <Kbd>{key}</Kbd> {hint}
        </span>
      ))}
    </p>
  );
}

function SearchInputTrailing({
  isLoading,
  isPending,
}: {
  readonly isLoading: boolean;
  readonly isPending: boolean;
}) {
  if (isPending || isLoading) {
    return (
      <div className='flex shrink-0'>
        <LoadingSpinner size='sm' tone='muted' label='Loading' />
      </div>
    );
  }

  return (
    <div className='flex shrink-0'>
      <Search
        className='h-4 w-4 shrink-0 text-tertiary-token'
        aria-hidden='true'
      />
    </div>
  );
}

interface SpotifyConnectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Provider link state read before any search renders (undefined = resolving). */
  readonly connected?: boolean;
  readonly connectedArtistName?: string | null;
  readonly onConnected?: Parameters<typeof useSpotifyConnect>[0]['onConnected'];
  readonly onImportStart?: (artistName: string) => void;
}

export function SpotifyConnectDialog({
  open,
  onOpenChange,
  connected,
  connectedArtistName = null,
  onConnected,
  onImportStart,
}: SpotifyConnectDialogProps) {
  const [formState, dispatch] = useReducer(
    releasesEmptyStateReducer,
    initialState
  );
  const [showChangeSearch, setShowChangeSearch] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<SpotifyArtist | null>(
    null
  );
  const [succeeded, setSucceeded] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    results,
    state: searchState,
    error: searchError,
    search,
    searchImmediate,
    clear,
  } = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });

  const handleConnected = useCallback(
    (releases: ReleaseViewModel[], artistName: string) => {
      onConnected?.(releases, artistName);
      setSucceeded(true);
      successTimerRef.current = setTimeout(() => onOpenChange(false), 600);
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

  const isResolving = connected === undefined;
  const isSearchMode =
    !isResolving && (succeeded || !connected || showChangeSearch);
  const trimmedQuery = formState.searchQuery.trim();
  const isLoading = searchState === 'loading';

  // Offline keeps the typed query; going online re-runs the last query.
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      const query = inputRef.current?.value.trim();
      if (query && !isSpotifyUrl(query)) search(query);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [search]);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (prevOpenRef.current !== open) {
      prevOpenRef.current = open;
      if (open) {
        dispatch({ type: 'RESET_STATE' });
        setShowChangeSearch(false);
        setSelectedArtist(null);
        setSucceeded(false);
        clear();
      } else if (successTimerRef.current) clearTimeout(successTimerRef.current);
    }
    if (!open || !isSearchMode) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [open, clear, isSearchMode]);

  useEffect(
    () => () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    },
    []
  );

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
      if (selectedArtist) setSelectedArtist(null);
      if (isSpotifyUrl(value)) {
        dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
        return;
      }
      search(value);
      dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
    },
    [search, selectedArtist]
  );

  const handleRetrySearch = useCallback(() => {
    if (!trimmedQuery || isSpotifyUrl(trimmedQuery)) return;
    searchImmediate(trimmedQuery);
    dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
  }, [searchImmediate, trimmedQuery]);

  const handleSelectArtist = useCallback((artist: SpotifyArtist) => {
    if (!canSelectArtist(artist)) return;
    setSelectedArtist(artist);
    dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: 0 });
    inputRef.current?.focus();
  }, []);

  const handleConnectSelected = useCallback(() => {
    if (isPending || isOffline || !selectedArtist) return;
    handleArtistSelect(selectedArtist);
  }, [handleArtistSelect, isOffline, isPending, selectedArtist]);

  // Enter without a selection only connects an explicit pasted URL.
  const handleClaimArtist = useCallback(() => {
    if (isPending || isOffline) return;
    const query = formState.searchQuery.trim();
    if (!query) return;

    dispatch({ type: 'SET_ERROR', payload: null });

    if (isSpotifyUrl(query)) {
      const artistId = extractSpotifyArtistId(query);
      if (!artistId) {
        dispatch({
          type: 'SET_ERROR',
          payload: 'Enter a valid Spotify artist URL',
        });
        return;
      }
      connectFromUrl(artistId);
    }
  }, [
    connectFromUrl,
    extractSpotifyArtistId,
    formState.searchQuery,
    isPending,
    isOffline,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (formState.showResults || selectedArtist) {
          e.preventDefault();
          setSelectedArtist(null);
          dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
          dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
        }
        return;
      }
      if (!formState.showResults) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedArtist) handleConnectSelected();
          else handleClaimArtist();
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload: getNextSelectableIndex(
              formState.activeResultIndex,
              1,
              selectedArtist ? [selectedArtist] : results
            ),
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          dispatch({
            type: 'SET_ACTIVE_RESULT_INDEX',
            payload: getNextSelectableIndex(
              formState.activeResultIndex,
              -1,
              selectedArtist ? [selectedArtist] : results
            ),
          });
          break;
        case 'Enter': {
          e.preventDefault();
          if (selectedArtist) {
            handleConnectSelected();
            return;
          }
          const activeArtist = results[formState.activeResultIndex];
          if (activeArtist && canSelectArtist(activeArtist)) {
            handleSelectArtist(activeArtist);
            return;
          }
          handleClaimArtist();
          break;
        }
      }
    },
    [
      formState.activeResultIndex,
      formState.showResults,
      handleClaimArtist,
      handleConnectSelected,
      handleSelectArtist,
      results,
      selectedArtist,
    ]
  );

  const shouldShowDropdown = Boolean(
    selectedArtist ||
      (formState.showResults &&
        trimmedQuery &&
        !isSpotifyUrl(trimmedQuery) &&
        (searchState !== 'idle' || results.length > 0))
  );

  const visibleResults = selectedArtist ? [selectedArtist] : results;
  const hasVisibleResults =
    shouldShowDropdown && (selectedArtist !== null || results.length > 0);

  const statusAnnouncement = useMemo(() => {
    if (!isSearchMode || selectedArtist) return '';
    if (searchState === 'loading') return 'Searching Spotify artists';
    if (searchState === 'empty') return 'No artists match';
    if (searchState === 'error')
      return searchError || "Couldn't reach Spotify. Try again.";
    if (searchState === 'success')
      return `${results.length} ${results.length === 1 ? 'artist' : 'artists'}`;
    return '';
  }, [isSearchMode, results.length, searchError, searchState, selectedArtist]);

  const primaryLabel =
    succeeded || !isSearchMode
      ? 'Done'
      : isOffline
        ? "You're offline"
        : selectedArtist
          ? `Connect ${selectedArtist.name}`
          : 'Connect';
  const primaryDisabled =
    isOffline ||
    (isSearchMode &&
      !succeeded &&
      !selectedArtist &&
      !isSpotifyUrl(trimmedQuery));
  const escapeHatchFocus = () => inputRef.current?.focus();

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} size='lg'>
      <DialogTitle className='text-lg font-semibold text-primary-token'>
        Connect Spotify
      </DialogTitle>
      <DialogDescription className='text-app text-secondary-token'>
        Search your artist name or paste a Spotify artist link.
      </DialogDescription>

      <DialogBody>
        {isResolving ? (
          <SearchResultsLoadingSkeleton />
        ) : !isSearchMode ? (
          <div
            className='flex items-center gap-3'
            data-testid='spotify-connect-connected-summary'
          >
            <ProviderIcon provider='spotify' className='h-10 w-10' />
            <div className='min-w-0 flex-1'>
              <p
                className='truncate text-app font-caption text-primary-token'
                data-testid='spotify-connect-connected-name'
              >
                {connectedArtistName ?? 'Spotify connected'}
              </p>
              <p className='flex items-center gap-1 text-2xs text-tertiary-token'>
                <BadgeCheck
                  className='h-3.5 w-3.5 text-success'
                  aria-hidden='true'
                />
                Connected
              </p>
            </div>
          </div>
        ) : succeeded ? (
          <p
            className='flex items-center gap-2 py-2 text-app text-primary-token'
            role='status'
            data-testid='spotify-connect-success'
          >
            <BadgeCheck className='h-4 w-4 text-success' aria-hidden='true' />
            Connected
          </p>
        ) : (
          <div ref={containerRef}>
            {isOffline && (
              <InlineOfflineNotice
                message="You're offline. Your search will re-run when you reconnect."
                className='mb-2'
              />
            )}
            <label htmlFor='spotify-connect-search' className='sr-only'>
              Search Spotify artists or paste a link
            </label>
            <Input
              ref={inputRef}
              id='spotify-connect-search'
              type='text'
              value={formState.searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (
                  trimmedQuery.length >= 1 &&
                  !isSpotifyUrl(formState.searchQuery)
                ) {
                  dispatch({ type: 'SET_SHOW_RESULTS', payload: true });
                }
              }}
              onBlur={e => {
                const next = e.relatedTarget;
                if (
                  next instanceof Node &&
                  containerRef.current?.contains(next)
                )
                  return;
                dispatch({ type: 'SET_SHOW_RESULTS', payload: false });
                dispatch({ type: 'SET_ACTIVE_RESULT_INDEX', payload: -1 });
              }}
              placeholder={DEFAULT_PLACEHOLDER}
              autoCapitalize='none'
              autoCorrect='off'
              autoComplete='off'
              disabled={isPending}
              error={formState.error ?? undefined}
              aria-describedby={HINTS_ID}
              role='combobox'
              aria-autocomplete='list'
              aria-expanded={hasVisibleResults}
              aria-controls={hasVisibleResults ? RESULTS_ID : undefined}
              aria-activedescendant={
                hasVisibleResults && visibleResults[formState.activeResultIndex]
                  ? `spotify-connect-result-${formState.activeResultIndex}`
                  : undefined
              }
              trailing={
                <SearchInputTrailing
                  isLoading={isLoading}
                  isPending={isPending}
                />
              }
            />

            <p className='sr-only' aria-live='polite'>
              {statusAnnouncement}
            </p>
            <SearchKeyboardHints />

            {shouldShowDropdown && (
              <div
                className='mt-1'
                data-testid='spotify-connect-results-region'
              >
                {isLoading && results.length === 0 && !selectedArtist && (
                  <SearchResultsLoadingSkeleton />
                )}

                {searchState === 'empty' && !selectedArtist && (
                  <SearchDropdownState
                    message={`No artists match '${formState.searchQuery}'.`}
                    onEscapeHatch={escapeHatchFocus}
                  />
                )}

                {searchState === 'error' && !selectedArtist && (
                  <SearchDropdownState
                    message={
                      searchError || "Couldn't reach Spotify. Try again."
                    }
                    tone='error'
                    onRetry={handleRetrySearch}
                    onEscapeHatch={escapeHatchFocus}
                  />
                )}

                {(selectedArtist || results.length > 0) && (
                  <div
                    ref={resultsListRef}
                    id={RESULTS_ID}
                    role='listbox'
                    aria-label='Spotify Artist Results'
                    className='max-h-64 overflow-y-auto py-1'
                  >
                    {visibleResults.map((artist, index) => (
                      <button
                        key={artist.id}
                        type='button'
                        role='option'
                        id={`spotify-connect-result-${index}`}
                        aria-selected={index === formState.activeResultIndex}
                        data-testid='spotify-connect-result'
                        disabled={!canSelectArtist(artist)}
                        className={cn(
                          'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-interactive-hover',
                          index === formState.activeResultIndex &&
                            canSelectArtist(artist) &&
                            'bg-interactive-hover',
                          !canSelectArtist(artist)
                            ? 'cursor-not-allowed opacity-50 hover:bg-transparent'
                            : 'cursor-pointer'
                        )}
                        onClick={() => handleSelectArtist(artist)}
                        onMouseEnter={() =>
                          dispatch({
                            type: 'SET_ACTIVE_RESULT_INDEX',
                            payload: index,
                          })
                        }
                      >
                        <div className='relative h-10 w-10 shrink-0 overflow-hidden rounded-full'>
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
                            <div className='flex h-full w-full items-center justify-center'>
                              <ProviderIcon
                                provider='spotify'
                                className='h-5 w-5'
                              />
                            </div>
                          )}
                        </div>
                        <div className='min-w-0 flex-1'>
                          <div className='truncate text-app font-caption text-primary-token'>
                            {artist.name}
                          </div>
                          {artist.isClaimed &&
                            !artist.isClaimedByCurrentUser && (
                              <div className='text-2xs tabular-nums text-tertiary-token'>
                                Already claimed
                              </div>
                            )}
                          {canSelectArtist(artist) &&
                            artist.followers !== undefined && (
                              <div className='text-2xs tabular-nums text-tertiary-token'>
                                {formatFollowers(artist.followers)}
                              </div>
                            )}
                        </div>
                        {artist.verified && (
                          <div
                            className='shrink-0 text-brand-spotify'
                            data-testid='verified-badge'
                          >
                            <BadgeCheck
                              className='h-4 w-4'
                              aria-hidden='true'
                            />
                            <span className='sr-only'>Verified artist</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogBody>

      {!isResolving && (
        <DialogActions>
          {!isSearchMode && (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                setShowChangeSearch(true);
                if (connectedArtistName) {
                  dispatch({
                    type: 'SET_SEARCH_QUERY',
                    payload: connectedArtistName,
                  });
                  search(connectedArtistName);
                }
              }}
              data-testid='spotify-connect-change'
            >
              {/* ui-casing-allow: sentence case per owner decision JOV-8975 (2026-10-23) */}
              Change artist
            </Button>
          )}
          <Button
            type='button'
            variant='primary'
            size='sm'
            disabled={primaryDisabled}
            loading={isPending && !!selectedArtist}
            onClick={
              succeeded || !isSearchMode
                ? () => onOpenChange(false)
                : selectedArtist
                  ? handleConnectSelected
                  : handleClaimArtist
            }
            aria-label={selectedArtist ? primaryLabel : undefined}
            data-testid='spotify-connect-primary'
            className='max-w-56'
          >
            <span className='truncate'>{primaryLabel}</span>
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
