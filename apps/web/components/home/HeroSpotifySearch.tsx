'use client';

import { BadgeCheck, Link2, Search } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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
import {
  type SpotifyArtistResult,
  useArtistSearchQuery,
} from '@/lib/queries/useArtistSearchQuery';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';

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

/**
 * HeroSpotifySearch - Spotify artist search for the homepage hero.
 *
 * Adapts patterns from WaitlistSpotifySearch for the homepage context.
 * On artist selection, redirects to /signup with spotify_url and artist_name params.
 */
export function HeroSpotifySearch() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

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

  const handleNavigateToSignup = useCallback(
    (spotifyUrl: string, artistName?: string) => {
      const params = new URLSearchParams();
      params.set('spotify_url', spotifyUrl);
      if (artistName) {
        params.set('artist_name', artistName);
      }
      router.push(`${APP_ROUTES.SIGNUP}?${params.toString()}`);
    },
    [router]
  );

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      setActiveIndex(-1);

      // If user pastes a Spotify URL, go directly to signup
      if (isSpotifyUrl(value)) {
        handleNavigateToSignup(value.trim());
        return;
      }

      search(value);
      setShowResults(true);
    },
    [search, handleNavigateToSignup]
  );

  const handleArtistSelect = useCallback(
    (artist: SpotifyArtistResult) => {
      handleNavigateToSignup(artist.url, artist.name);
    },
    [handleNavigateToSignup]
  );

  const handleContinue = useCallback(() => {
    const query = searchQuery.trim();
    if (!query) return;

    if (isSpotifyUrl(query)) {
      handleNavigateToSignup(query);
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
    handleNavigateToSignup,
    handleArtistSelect,
  ]);

  const handlePasteUrlClick = useCallback(() => {
    // Focus input and hint user to paste their URL
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
      handleArtistSelect,
      handlePasteUrlClick,
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
  const showContinueAction =
    Boolean(trimmedQuery) && (isSpotifyUrl(trimmedQuery) || results.length > 0);

  return (
    <div className='relative mx-auto w-full max-w-[480px]'>
      <label htmlFor='hero-spotify-search' className='sr-only'>
        Search Spotify artists or paste a link
      </label>
      <div
        className={cn(
          'w-full flex items-center gap-3 rounded-xl border px-4 py-3 min-h-12 bg-surface-0',
          'transition-all duration-200',
          shouldShowDropdown
            ? 'border-focus ring-2 ring-focus/20'
            : 'border-strong hover:border-focus'
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
          id='hero-spotify-search'
          type='text'
          value={searchQuery}
          onChange={handleSearchInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchQuery.length >= 1 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder='Search your artist name or paste a Spotify link'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='min-w-0 flex-1 bg-transparent text-sm text-primary-token focus-visible:outline-none'
          role='combobox'
          aria-expanded={shouldShowDropdown}
          aria-controls='hero-spotify-results'
          aria-activedescendant={
            activeIndex >= 0 ? `hero-result-${activeIndex}` : undefined
          }
        />
        {state === 'loading' ? (
          <div className='w-4 h-4 border-2 border-tertiary-token border-t-transparent rounded-full animate-spin motion-reduce:animate-none shrink-0' />
        ) : showContinueAction ? (
          <button
            type='button'
            onClick={handleContinue}
            className='shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-semibold transition-colors focus-ring-themed bg-btn-primary text-btn-primary-foreground'
          >
            Continue
          </button>
        ) : (
          <Search className='w-4 h-4 shrink-0 text-tertiary-token' />
        )}
      </div>

      <p className='mt-2 text-center text-xs text-tertiary-token'>
        {isSpotifyUrl(trimmedQuery)
          ? 'Spotify URL detected — press Continue to import.'
          : 'Search by name or paste a Spotify URL.'}
      </p>

      {/* Dropdown results */}
      {shouldShowDropdown && (
        <div className='absolute z-50 w-full mt-2 rounded-xl border border-default overflow-hidden bg-surface-0 shadow-lg'>
          <select
            id='hero-spotify-results'
            className='sr-only'
            size={Math.min(totalItems, 6)}
            aria-label='Spotify artist results'
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
                id={`hero-result-${index}`}
                value={artist.id}
              >
                {artist.name}
                {artist.followers
                  ? ` — ${formatFollowers(artist.followers)}`
                  : ''}
              </option>
            ))}
            <option id={`hero-result-${pasteUrlIndex}`} value='__paste__'>
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
                    'flex items-center gap-3 p-3 cursor-pointer transition-colors border-0 bg-transparent w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset',
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
                    {artist.followers && (
                      <div className='text-xs text-tertiary-token'>
                        {formatFollowers(artist.followers)}
                      </div>
                    )}
                  </div>
                  {artist.verified && (
                    <div className='shrink-0 text-brand-spotify'>
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
              'flex items-center gap-3 p-3 cursor-pointer transition-colors bg-transparent w-full text-left border-t border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset',
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

      {/* Fallback: sign up without Spotify */}
      <p className='mt-2 text-center text-[13px] text-tertiary-token'>
        or{' '}
        <Link
          href={APP_ROUTES.SIGNUP}
          className='underline transition-colors text-secondary-token'
        >
          sign up without Spotify
        </Link>
      </p>
    </div>
  );
}
