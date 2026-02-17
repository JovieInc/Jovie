'use client';

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
import {
  type SpotifyArtistResult,
  useArtistSearchQuery,
} from '@/lib/queries/useArtistSearchQuery';
import { cn } from '@/lib/utils';

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
  const _trimmedQuery = searchQuery.trim();

  return (
    <div className='relative w-full'>
      <label htmlFor='hero-spotify-search' className='sr-only'>
        Search Spotify artists or paste a profile link
      </label>
      <div
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-4 py-3.5',
          'transition-all duration-200',
          shouldShowDropdown
            ? 'border-white/[0.14] bg-white/[0.06]'
            : 'border-white/[0.08] bg-white/[0.03]'
        )}
        style={{
          border: '1px solid',
          borderColor: shouldShowDropdown
            ? 'rgba(255,255,255,0.14)'
            : 'rgba(255,255,255,0.08)',
          boxShadow: shouldShowDropdown
            ? 'inset 0 1px 2px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.04)'
            : 'inset 0 1px 1px rgba(0,0,0,0.12)',
        }}
      >
        <Search
          className='h-4 w-4 shrink-0'
          style={{ color: 'oklch(52% 0.008 260)' }}
        />
        <input
          ref={inputRef}
          id='hero-spotify-search'
          type='text'
          value={searchQuery}
          onChange={handleSearchInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchQuery.length >= 1 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder='Search Spotify artists or paste a profile link'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='min-w-0 flex-1 bg-transparent text-[14px] text-secondary-token placeholder:text-quaternary-token focus-visible:outline-none'
          style={{ letterSpacing: '0.005em' }}
          role='combobox'
          aria-expanded={shouldShowDropdown}
          aria-controls='hero-spotify-results'
          aria-activedescendant={
            activeIndex >= 0 ? `hero-result-${activeIndex}` : undefined
          }
        />
        {state === 'loading' && (
          <div className='h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-tertiary-token border-t-transparent motion-reduce:animate-none' />
        )}
      </div>

      {/* Dropdown results */}
      {shouldShowDropdown && (
        <div
          id='hero-spotify-results'
          role='listbox'
          aria-label='Spotify artist results'
          className='absolute z-50 w-full mt-2 rounded-xl border border-default overflow-hidden bg-surface-0 shadow-lg'
        >
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
            <div ref={resultsListRef} className='max-h-64 overflow-y-auto'>
              {results.map((artist, index) => (
                <div
                  key={artist.id}
                  role='option'
                  aria-selected={index === activeIndex}
                  id={`hero-result-${index}`}
                  tabIndex={-1}
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer transition-colors border-0 bg-transparent w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset',
                    index === activeIndex && 'bg-surface-1'
                  )}
                  onClick={() => handleArtistSelect(artist)}
                  onKeyDown={() => {}} // keyboard nav handled by input via aria-activedescendant
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
                </div>
              ))}
            </div>
          )}

          {/* "Paste URL" option */}
          <div
            role='option'
            aria-selected={activeIndex === pasteUrlIndex}
            id={`hero-result-${pasteUrlIndex}`}
            tabIndex={-1}
            className={cn(
              'flex items-center gap-3 p-3 cursor-pointer transition-colors bg-transparent w-full text-left border-t border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset',
              activeIndex === pasteUrlIndex && 'bg-surface-1'
            )}
            onClick={handlePasteUrlClick}
            onKeyDown={() => {}} // keyboard nav handled by input via aria-activedescendant
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
          </div>
        </div>
      )}
    </div>
  );
}
