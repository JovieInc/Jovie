// @coverage-via apps/web/tests/unit/home/HeroSpotifySearch.test.tsx
'use client';

import { Button } from '@jovie/ui/atoms/button';
import { CompositeField } from '@jovie/ui/atoms/composite-field';
import { HostDrawnInput } from '@jovie/ui/atoms/host-drawn-field';
import { Search } from 'lucide-react';
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
import { artistSearchQuerySchema } from '@/lib/validation/schemas/spotify';
import { HeroSpotifyResults } from './HeroSpotifyResults';
import { isSpotifyUrl } from './hero-spotify-search-utils';
import { InputAuraFrame } from './InputAuraFrame';

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
  const isNavigatingRef = useRef(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    results: searchResults,
    state,
    search,
    searchImmediate,
    clear,
  } = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });
  const isLoading = state === 'loading';
  const trimmedInput = searchQuery.trim();
  const isInvalidQuery =
    Boolean(trimmedInput) &&
    !isSpotifyUrl(trimmedInput) &&
    !artistSearchQuerySchema.safeParse(trimmedInput).success;
  const results = useMemo(
    () => (isInvalidQuery ? [] : searchResults),
    [isInvalidQuery, searchResults]
  );

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

  const navigateToStart = useCallback(
    (params: URLSearchParams, analytics: Record<string, unknown>) => {
      if (isNavigatingRef.current) return;
      isNavigatingRef.current = true;
      setIsNavigating(true);
      clear();
      setShowResults(false);
      setActiveIndex(-1);
      if (submitAnalytics) {
        track(submitAnalytics.eventName, {
          ...submitAnalytics.properties,
          ...analytics,
        });
      }
      router.push(`${APP_ROUTES.START}?${params.toString()}`);
    },
    [clear, router, submitAnalytics]
  );

  const handleNavigateToStart = useCallback(
    (spotifyUrl: string, artistName?: string) => {
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
      navigateToStart(params, { hasArtistName: Boolean(artistName) });
    },
    [navigateToStart]
  );

  /**
   * Free-text submit: route the typed name to /start as a starter prompt
   * with no Spotify attribution. Used when the visitor submits without
   * picking a dropdown result — we must not silently substitute Spotify's
   * top hit for their intent (JOV-6114).
   */
  const handleNavigateToStartPrompt = useCallback(
    (query: string) => {
      const params = new URLSearchParams();
      params.set('starter_prompt', `hey, I'm ${query}. show me my Spotify.`);
      navigateToStart(params, { hasArtistName: true, freeText: true });
    },
    [navigateToStart]
  );

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Fresh input means the prior push never completed the route change
      // (the component is still mounted), so re-arm the navigation latch.
      isNavigatingRef.current = false;
      setIsNavigating(false);
      setSearchQuery(value);
      setActiveIndex(-1);

      // If user pastes a Spotify URL, show it in the input but don't
      // auto-navigate — let them click "Claim Artist" to proceed.
      if (isSpotifyUrl(value)) {
        clear();
        setShowResults(false);
        return;
      }

      if (
        value.trim() &&
        !artistSearchQuerySchema.safeParse(value.trim()).success
      ) {
        clear();
      } else {
        search(value);
      }
      setShowResults(Boolean(value.trim()));
    },
    [search, clear]
  );

  const handleArtistSelect = useCallback(
    (artist: SpotifyArtistResult) => {
      if (isLoading) return;
      handleNavigateToStart(artist.url, artist.name);
    },
    [handleNavigateToStart, isLoading]
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

    if (isInvalidQuery) {
      setShowResults(true);
      inputRef.current?.focus();
      return;
    }

    const activeArtist =
      activeIndex >= 0 && activeIndex < results.length
        ? results[activeIndex]
        : undefined;

    if (activeArtist) {
      handleArtistSelect(activeArtist);
      return;
    }

    // Nothing explicitly highlighted: never auto-claim results[0]. Spotify's
    // top hit is frequently a different artist, which silently routed
    // visitors under the wrong identity (JOV-6114). Hand the typed name to
    // /start as free text and let onboarding resolve the artist.
    handleNavigateToStartPrompt(query);
  }, [
    searchQuery,
    activeIndex,
    results,
    isNavigating,
    isInvalidQuery,
    handleNavigateToStart,
    handleNavigateToStartPrompt,
    handleArtistSelect,
  ]);

  const handleRetry = useCallback(() => {
    searchImmediate(searchQuery);
    inputRef.current?.focus();
  }, [searchImmediate, searchQuery]);

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
            // No active selection → typed submit (free-text route or URL)
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
  // Default: show the button once the user has typed; disable while loading.
  // Editorial: the submit pill is the hero's one primary action, so it stays
  // visible and enabled — an empty submit just focuses the field.
  const showClaimButton = isEditorial || Boolean(trimmedQuery);
  // A valid typed query is always submittable: without an explicit dropdown
  // pick it routes to /start as a free-text prompt, so an empty/slow results
  // list never dead-ends the funnel.
  const claimButtonDisabled =
    isNavigating || (!isEditorial && (!trimmedQuery || isInvalidQuery));

  const fieldClassName = isEditorial
    ? cn(
        'homepage-name-search__field relative flex w-full items-center',
        shouldShowDropdown && 'homepage-name-search__field--open'
      )
    : 'w-full text-sm text-primary-token';

  const submitControl = (
    <Button
      type='submit'
      size={isEditorial ? 'marketing' : 'sm'}
      variant='primary'
      loading={isEditorial ? isLoading && Boolean(trimmedQuery) : isLoading}
      disabled={isEditorial ? undefined : claimButtonDisabled}
      onClick={handleClaimArtist}
      className={cn('shrink-0', isEditorial && 'homepage-name-search__submit')}
      data-testid={submitTestId}
    >
      {submitLabel}
    </Button>
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
        {isEditorial ? placeholder : 'Search Spotify artists or paste a link'}
      </label>
      <InputAuraFrame
        treatment={isEditorial ? 'editorial' : 'default'}
        className={isEditorial ? 'rounded-full' : undefined}
      >
        <form
          action={APP_ROUTES.START}
          className={fieldClassName}
          method='get'
          onSubmit={event => {
            event.preventDefault();
            handleClaimArtist();
          }}
        >
          {/* Editorial: the stylesheet owns the pill and the input's own inset
              focus ring (JOV-6946), so the shell box is dropped. */}
          <CompositeField
            shape={isEditorial ? 'pill' : 'md'}
            size='md'
            surface={isEditorial ? 'none' : 'field'}
            className={isEditorial ? 'contents' : undefined}
          >
            {isEditorial ? (
              <Search
                aria-hidden='true'
                className='homepage-name-search__icon size-4 shrink-0 text-tertiary-token'
              />
            ) : (
              <div className='flex items-center justify-center size-6 rounded-full shrink-0 bg-brand-spotify-subtle'>
                <SocialIcon
                  platform='spotify'
                  className='w-3.5 h-3.5 text-brand-spotify'
                />
              </div>
            )}
            <HostDrawnInput
              ref={inputRef}
              id={inputId}
              name='artist_name'
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
                'min-w-0 flex-1',
                isEditorial && 'homepage-name-search__input'
              )}
              role='combobox'
              aria-invalid={isInvalidQuery || undefined}
              aria-describedby={
                isInvalidQuery && shouldShowDropdown
                  ? `${resultsId}-validation`
                  : undefined
              }
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
          </CompositeField>
        </form>

        {/* Dropdown results — inside InputAuraFrame so group-focus-within stays active while interacting */}
        {shouldShowDropdown && (
          <HeroSpotifyResults
            resultsId={resultsId}
            isEditorial={isEditorial}
            results={results}
            state={state}
            isLoading={isLoading}
            isInvalidQuery={isInvalidQuery}
            activeIndex={activeIndex}
            pasteUrlIndex={pasteUrlIndex}
            totalItems={totalItems}
            resultsListRef={resultsListRef}
            onActiveIndexChange={setActiveIndex}
            onSelectArtist={handleArtistSelect}
            onPasteUrl={handlePasteUrlClick}
            onRetry={handleRetry}
          />
        )}
      </InputAuraFrame>
    </div>
  );
}
