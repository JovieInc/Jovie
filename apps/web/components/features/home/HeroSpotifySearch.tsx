'use client';

import { Button } from '@jovie/ui/atoms/button';
import { BadgeCheck, Link2, Search } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { type SpotifyArtistResult, useArtistSearchQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import { InputAuraFrame } from './InputAuraFrame';

const LOADING_SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'];

function formatFollowers(count: number | undefined): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M followers`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K followers`;
  return `${count} followers`;
}

/**
 * Detect if a string looks like a Spotify URL.
 */
function isSpotifyUrl(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('https://open.spotify.com/') ||
    trimmed.startsWith('open.spotify.com/') ||
    trimmed.startsWith('spotify.com/')
  );
}

interface HeroSpotifySearchSubmitAnalytics {
  readonly eventName: string;
  readonly properties?: Record<string, unknown>;
}

export interface HeroSpotifySearchProps {
  /**
   * `default` keeps the Spotify-badged field. `editorial` renders the same
   * search as a single pill with an always-visible submit action, styled by
   * the homepage stylesheet (`homepage-name-search*`).
   */
  readonly appearance?: 'default' | 'editorial';
  readonly inputId?: string;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly submitTestId?: string;
  readonly submitAnalytics?: HeroSpotifySearchSubmitAnalytics;
}

const DEFAULT_INPUT_ID = 'hero-spotify-search';
const DEFAULT_RESULTS_ID = 'hero-spotify-results';
const DEFAULT_PLACEHOLDER = 'Search your artist name or paste a Spotify link';
const DEFAULT_SUBMIT_LABEL = 'Claim Artist';

/**
 * HeroSpotifySearch - Spotify artist search for the homepage hero.
 *
 * Adapts patterns from WaitlistSpotifySearch for the homepage context.
 * On artist selection, routes into /start with a Spotify-first starter prompt.
 */
export function HeroSpotifySearch({
  appearance = 'default',
  inputId = DEFAULT_INPUT_ID,
  placeholder = DEFAULT_PLACEHOLDER,
  submitLabel = DEFAULT_SUBMIT_LABEL,
  submitTestId,
  submitAnalytics,
}: HeroSpotifySearchProps = {}) {
  const isEditorial = appearance === 'editorial';
  const resultsId =
    inputId === DEFAULT_INPUT_ID ? DEFAULT_RESULTS_ID : `${inputId}-results`;
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isNavigating, setIsNavigating] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, state, search, clear } = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });

  // Total items: results + "paste URL" option
  const totalItems = results.length + 1;
  const pasteUrlIndex = results.length;

  // Scroll active result into view
  useEffect(() => {
    if (
      activeIndex >= 0 &&
      activeIndex < results.length &&
      resultsListRef.current
    ) {
      const activeItem = resultsListRef.current.children[
        activeIndex
      ] as HTMLElement;
      activeItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, results.length]);

  const handleNavigateToStart = useCallback(
    (spotifyUrl: string, artistName?: string) => {
      if (isNavigating) return;
      setIsNavigating(true);
      if (submitAnalytics) {
        track(submitAnalytics.eventName, {
          ...submitAnalytics.properties,
          hasArtistName: Boolean(artistName),
        });
      }
      const params = new URLSearchParams();
      params.set('spotify_url', spotifyUrl);
      if (artistName) {
        params.set('artist_name', artistName);
      }
      params.set(
        'starter_prompt',
        artistName
          ? `hey, I'm ${artistName}. show me my Spotify.`
          : `show me this Spotify artist: ${spotifyUrl}`
      );
      router.push(`${APP_ROUTES.START}?${params.toString()}`);
    },
    [router, isNavigating, submitAnalytics]
  );

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      setActiveIndex(-1);

      // If user pastes a Spotify URL, show it in the input but don't
      // auto-navigate — let them click "Claim Artist" to proceed.
      if (isSpotifyUrl(value)) {
        setShowResults(false);
        return;
      }

      search(value);
      setShowResults(true);
    },
    [search]
  );

  const handleArtistSelect = useCallback(
    (artist: SpotifyArtistResult) => {
      handleNavigateToStart(artist.url, artist.name);
    },
    [handleNavigateToStart]
  );

  const handleClaimArtist = useCallback(() => {
    if (isNavigating) return;
    const query = searchQuery.trim();
    if (!query) {
      inputRef.current?.focus();
      return;
    }

    if (isSpotifyUrl(query)) {
      handleNavigateToStart(query);
      return;
    }

    const activeArtist =
      activeIndex >= 0 && activeIndex < results.length
        ? results[activeIndex]
        : undefined;
    const fallbackArtist = results[0];
    const nextArtist = activeArtist ?? fallbackArtist;

    if (nextArtist) {
      handleArtistSelect(nextArtist);
      return;
    }

    setShowResults(true);
    inputRef.current?.focus();
  }, [
    searchQuery,
    activeIndex,
    results,
    isNavigating,
    handleNavigateToStart,
    handleArtistSelect,
  ]);

  const handlePasteUrlClick = useCallback(() => {
    setSearchQuery('');
    setShowResults(false);
    setActiveIndex(-1);
    clear();
    if (inputRef.current) {
      inputRef.current.placeholder = 'Paste your Spotify artist URL here';
      inputRef.current.focus();
    }
  }, [clear]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Enter on empty results with a query → trigger claim
      if (e.key === 'Enter' && !showResults && searchQuery.trim()) {
        e.preventDefault();
        handleClaimArtist();
        return;
      }

      if (!showResults) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowResults(false);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev => (prev < totalItems - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev => (prev > 0 ? prev - 1 : totalItems - 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            const artist = results[activeIndex];
            if (artist) handleArtistSelect(artist);
          } else if (activeIndex === pasteUrlIndex) {
            handlePasteUrlClick();
          } else {
            // No active selection → claim first result or URL
            handleClaimArtist();
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowResults(false);
          setActiveIndex(-1);
          break;
        case 'Tab':
          setShowResults(false);
          setActiveIndex(-1);
          break;
      }
    },
    [
      showResults,
      totalItems,
      results,
      activeIndex,
      pasteUrlIndex,
      searchQuery,
      handleArtistSelect,
      handlePasteUrlClick,
      handleClaimArtist,
    ]
  );

  // Determine if dropdown should show
  const shouldShowDropdown = useMemo(() => {
    if (!showResults) return false;
    if (state === 'loading') return true;
    if (state === 'empty' || state === 'error') return true;
    if (results.length > 0) return true;
    return searchQuery.length >= 1;
  }, [showResults, state, results.length, searchQuery.length]);

  const trimmedQuery = searchQuery.trim();
  const isLoading = state === 'loading';
  // Default: show the button once the user has typed; disable while loading.
  // Editorial: the submit pill is the hero's one primary action, so it stays
  // visible and enabled — an empty submit just focuses the field.
  const showClaimButton = isEditorial || Boolean(trimmedQuery);
  const claimButtonDisabled =
    isNavigating ||
    (!isEditorial &&
      ((isLoading && !isSpotifyUrl(trimmedQuery)) ||
        (!isSpotifyUrl(trimmedQuery) && results.length === 0)));

  const fieldClassName = isEditorial
    ? cn(
        'homepage-name-search__field relative flex w-full items-center',
        shouldShowDropdown && 'homepage-name-search__field--open'
      )
    : cn(
        'relative w-full flex items-center gap-3 rounded-xl border px-4 py-3 min-h-12 bg-surface-0',
        'transition-colors duration-subtle ease-subtle',
        shouldShowDropdown
          ? 'border-focus ring-2 ring-focus/20'
          : 'border-strong hover:border-focus'
      );

  const submitControl = isEditorial ? (
    <Button
      type='button'
      size='marketing'
      variant='primary'
      loading={isLoading && Boolean(trimmedQuery)}
      onClick={handleClaimArtist}
      className='homepage-name-search__submit shrink-0'
      data-testid={submitTestId}
    >
      {submitLabel}
    </Button>
  ) : (
    <button
      type='button'
      disabled={claimButtonDisabled}
      onClick={handleClaimArtist}
      data-testid={submitTestId}
      className={cn(
        'shrink-0 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold transition-colors focus-ring-themed',
        claimButtonDisabled
          ? 'bg-btn-primary/50 text-btn-primary-foreground/60 cursor-not-allowed'
          : 'bg-btn-primary text-btn-primary-foreground'
      )}
    >
      {isLoading && (
        <div className='w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin motion-reduce:animate-none' />
      )}
      {submitLabel}
    </button>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative mx-auto w-full',
        isEditorial ? 'homepage-name-search' : 'max-w-120'
      )}
      data-appearance={appearance}
    >
      <label htmlFor={inputId} className='sr-only'>
        Search Spotify artists or paste a link
      </label>
      <InputAuraFrame className={isEditorial ? 'rounded-full' : undefined}>
        <div className={fieldClassName}>
          {isEditorial ? null : (
            <div className='flex items-center justify-center size-6 rounded-full shrink-0 bg-brand-spotify-subtle'>
              <SocialIcon
                platform='spotify'
                className='w-3.5 h-3.5 text-brand-spotify'
              />
            </div>
          )}
          <input
            ref={inputRef}
            id={inputId}
            type='text'
            value={searchQuery}
            onChange={handleSearchInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (
                searchQuery.trim().length >= 1 &&
                !isSpotifyUrl(searchQuery)
              ) {
                setShowResults(true);
              }
            }}
            onBlur={e => {
              // Keep dropdown open if focus moves to another element inside the container
              if (containerRef.current?.contains(e.relatedTarget as Node))
                return;
              setShowResults(false);
              setActiveIndex(-1);
            }}
            placeholder={placeholder}
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            className={cn(
              'min-w-0 flex-1 bg-transparent text-primary-token focus-visible:outline-none',
              isEditorial ? 'homepage-name-search__input' : 'text-sm'
            )}
            role='combobox'
            aria-expanded={shouldShowDropdown}
            aria-controls={resultsId}
            aria-activedescendant={
              activeIndex >= 0
                ? `${resultsId}-result-${activeIndex}`
                : undefined
            }
          />
          {showClaimButton ? (
            submitControl
          ) : (
            <Search className='w-4 h-4 shrink-0 text-tertiary-token' />
          )}
        </div>

        {/* Dropdown results — inside InputAuraFrame so group-focus-within stays active while interacting */}
        {shouldShowDropdown && (
          <div
            className={cn(
              'absolute z-50 w-full mt-2 rounded-xl border border-default overflow-hidden bg-surface-0 shadow-lg',
              isEditorial && 'homepage-name-search__results text-left'
            )}
          >
            <select
              id={resultsId}
              className='sr-only'
              size={Math.min(totalItems, 6)}
              aria-label='Spotify Artist Results'
              value={
                activeIndex === pasteUrlIndex
                  ? '__paste__'
                  : (results[activeIndex]?.id ?? '')
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
                  id={`${resultsId}-result-${index}`}
                  value={artist.id}
                >
                  {artist.name}
                  {artist.followers
                    ? ` — ${formatFollowers(artist.followers)}`
                    : ''}
                </option>
              ))}
              <option
                id={`${resultsId}-result-${pasteUrlIndex}`}
                value='__paste__'
              >
                Paste a Spotify URL instead
              </option>
            </select>

            {/* Loading skeleton */}
            {state === 'loading' && results.length === 0 && (
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

            {/* Empty state */}
            {state === 'empty' && (
              <div className='p-4 text-center'>
                <p className='text-sm text-secondary-token'>No artists found</p>
              </div>
            )}

            {/* Error state */}
            {state === 'error' && (
              <div className='p-4 text-center'>
                <p className='text-sm text-error'>Search failed. Try again.</p>
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
                  <button
                    key={artist.id}
                    type='button'
                    tabIndex={0}
                    className={cn(
                      'flex items-center gap-3 p-3 cursor-pointer transition-colors border-0 bg-transparent w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 focus-visible:ring-inset',
                      index === activeIndex && 'bg-surface-1'
                    )}
                    onClick={() => handleArtistSelect(artist)}
                    onKeyDown={event =>
                      handleActivationKeyDown(event, () =>
                        handleArtistSelect(artist)
                      )
                    }
                    onMouseEnter={() => setActiveIndex(index)}
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
                      {artist.followers ? (
                        <div className='text-xs text-tertiary-token'>
                          {formatFollowers(artist.followers)}
                        </div>
                      ) : null}
                    </div>
                    {artist.isClaimed && (
                      <span className='shrink-0 rounded-full bg-brand-spotify-subtle px-2 py-0.5 text-3xs font-semibold text-brand-spotify'>
                        On Jovie
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
                  </button>
                ))}
              </div>
            )}

            {/* "Paste URL" option */}
            <button
              type='button'
              tabIndex={0}
              className={cn(
                'flex items-center gap-3 p-3 cursor-pointer transition-colors bg-transparent w-full text-left border-t border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 focus-visible:ring-inset',
                activeIndex === pasteUrlIndex && 'bg-surface-1'
              )}
              onClick={handlePasteUrlClick}
              onKeyDown={event =>
                handleActivationKeyDown(event, () => handlePasteUrlClick())
              }
              onMouseEnter={() => setActiveIndex(pasteUrlIndex)}
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
      </InputAuraFrame>
    </div>
  );
}
