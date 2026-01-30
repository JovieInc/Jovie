'use client';

import Image from 'next/image';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Input } from '@/components/atoms/Input';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { FORM_LAYOUT } from '@/lib/auth/constants';
import {
  type SpotifyArtistResult,
  useArtistSearchQuery,
} from '@/lib/queries/useArtistSearchQuery';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';
import type { FormErrors } from './types';

interface WaitlistSpotifySearchProps {
  readonly spotifyUrl: string;
  readonly onUrlChange: (url: string) => void;
  readonly fieldErrors: FormErrors;
  readonly isSubmitting: boolean;
  readonly isHydrating: boolean;
  readonly setInputRef: (el: HTMLInputElement | null) => void;
}

const LOADING_SKELETON_KEYS = ['skeleton-1', 'skeleton-2', 'skeleton-3'];

function formatFollowers(count: number | undefined): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M followers`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K followers`;
  return `${count} followers`;
}

export function WaitlistSpotifySearch({
  spotifyUrl,
  onUrlChange,
  fieldErrors,
  isSubmitting,
  isHydrating,
  setInputRef,
}: WaitlistSpotifySearchProps) {
  const [mode, setMode] = useState<'search' | 'url'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(
    null
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  const { results, state, search, clear } = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });

  // Calculate total items: results + "manually add" option
  const totalItems = results.length + 1;
  const manualAddIndex = results.length;

  // Focus input on mount (non-hydrating)
  useEffect(() => {
    if (isHydrating) return;
    inputRef.current?.focus();
  }, [isHydrating, mode]);

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

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      setActiveIndex(-1);
      setSelectedArtistName(null);
      search(value);
      setShowResults(true);
    },
    [search]
  );

  const handleArtistSelect = useCallback(
    (artist: SpotifyArtistResult) => {
      onUrlChange(artist.url);
      setSelectedArtistName(artist.name);
      setSearchQuery('');
      setShowResults(false);
      setActiveIndex(-1);
      clear();
      setMode('url');
    },
    [onUrlChange, clear]
  );

  const handleManualAddClick = useCallback(() => {
    setSearchQuery('');
    setShowResults(false);
    setActiveIndex(-1);
    clear();
    setMode('url');
    // Focus the URL input after mode switch
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [clear]);

  const handleBackToSearch = useCallback(() => {
    setMode('search');
    onUrlChange('');
    setSelectedArtistName(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onUrlChange]);

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
          } else if (activeIndex === manualAddIndex) {
            handleManualAddClick();
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
      manualAddIndex,
      handleArtistSelect,
      handleManualAddClick,
    ]
  );

  const handleUrlInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUrlChange(e.target.value);
      setSelectedArtistName(null);
    },
    [onUrlChange]
  );

  // Determine if dropdown should show
  const shouldShowDropdown = useMemo(() => {
    if (!showResults) return false;
    if (state === 'loading') return true;
    if (state === 'empty' || state === 'error') return true;
    if (results.length > 0) return true;
    // Show dropdown even for idle state once user starts typing (for manual add option)
    return searchQuery.length >= 1;
  }, [showResults, state, results.length, searchQuery.length]);

  // URL mode - show the selected artist name or URL input
  if (mode === 'url') {
    return (
      <div className='space-y-2'>
        {selectedArtistName ? (
          <div className='w-full flex items-center gap-3 rounded-[6px] border border-[#d7d9de] dark:border-[#2c2e33] bg-white dark:bg-[#0f1011] px-4 py-3'>
            <div className='flex items-center justify-center w-6 h-6 rounded-full bg-[#1DB954]/15'>
              <SocialIcon
                platform='spotify'
                className='w-3.5 h-3.5 text-[#1DB954]'
              />
            </div>
            <span className='flex-1 text-sm text-primary-token truncate'>
              {selectedArtistName}
            </span>
            <button
              type='button'
              onClick={handleBackToSearch}
              className='text-xs text-secondary-token hover:text-primary-token transition-colors'
              disabled={isSubmitting}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <label htmlFor='spotifyUrl' className='sr-only'>
              Spotify link
            </label>
            <Input
              ref={el => {
                inputRef.current = el;
                setInputRef(el);
              }}
              type='url'
              id='spotifyUrl'
              value={spotifyUrl}
              onChange={handleUrlInputChange}
              maxLength={2048}
              aria-invalid={Boolean(fieldErrors.spotifyUrl)}
              aria-describedby={
                fieldErrors.spotifyUrl
                  ? 'waitlist-spotify-url-error'
                  : undefined
              }
              placeholder='open.spotify.com/artist/... (optional)'
              disabled={isSubmitting}
            />
            <button
              type='button'
              onClick={handleBackToSearch}
              className='text-xs text-secondary-token hover:text-primary-token transition-colors'
              disabled={isSubmitting}
            >
              Search for artist instead
            </button>
          </>
        )}
        <div className={FORM_LAYOUT.errorContainer}>
          {fieldErrors.spotifyUrl && (
            <p
              id='waitlist-spotify-url-error'
              role='alert'
              className='text-sm text-red-400'
            >
              {fieldErrors.spotifyUrl[0]}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Search mode
  return (
    <div className='relative w-full space-y-2'>
      <label htmlFor='spotify-artist-search' className='sr-only'>
        Search Spotify artists
      </label>
      <div
        className={cn(
          'w-full flex items-center gap-3 rounded-[6px] border border-[#d7d9de] dark:border-[#2c2e33] bg-white dark:bg-[#0f1011] px-4 py-3',
          'focus-within:ring-2 focus-within:ring-[#6c78e6]/40 focus-within:ring-offset-2 focus-within:ring-offset-[#f5f5f5] dark:focus-within:ring-offset-[#090909]'
        )}
      >
        <div className='flex items-center justify-center w-6 h-6 rounded-full bg-[#1DB954]/15 shrink-0'>
          <SocialIcon
            platform='spotify'
            className='w-3.5 h-3.5 text-[#1DB954]'
          />
        </div>
        <input
          ref={el => {
            inputRef.current = el;
            setInputRef(el);
          }}
          id='spotify-artist-search'
          type='text'
          value={searchQuery}
          onChange={handleSearchInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => searchQuery.length >= 1 && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 150)}
          placeholder='Search artist name (optional)'
          disabled={isSubmitting}
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='min-w-0 flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token focus-visible:outline-none'
          role='combobox'
          aria-expanded={shouldShowDropdown}
          aria-controls='spotify-search-results'
          aria-activedescendant={
            activeIndex >= 0 ? `spotify-result-${activeIndex}` : undefined
          }
        />
        {state === 'loading' && (
          <div className='w-4 h-4 border-2 border-[#6b6f76] border-t-transparent rounded-full animate-spin' />
        )}
      </div>

      {/* Dropdown results */}
      {shouldShowDropdown && (
        <div
          className='absolute z-50 w-full mt-1 rounded-[6px] border border-[#d7d9de] dark:border-[#2c2e33] bg-white dark:bg-[#0f1011] shadow-lg overflow-hidden'
          style={{ top: '100%' }}
        >
          <select
            id='spotify-search-results'
            className='sr-only'
            size={Math.min(totalItems, 6)}
            aria-label='Spotify artist results'
            value={
              activeIndex === manualAddIndex
                ? '__manual__'
                : (results[activeIndex]?.id ?? '')
            }
            onChange={event => {
              if (event.target.value === '__manual__') {
                handleManualAddClick();
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
                id={`spotify-result-${index}`}
                value={artist.id}
              >
                {artist.name}
                {artist.followers
                  ? ` — ${formatFollowers(artist.followers)}`
                  : ''}
              </option>
            ))}
            <option id={`spotify-result-${manualAddIndex}`} value='__manual__'>
              Manually add URL
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
                  <div className='w-10 h-10 rounded-full bg-[#f0f0f0] dark:bg-[#1e2025]' />
                  <div className='flex-1 space-y-1'>
                    <div className='h-4 w-32 bg-[#f0f0f0] dark:bg-[#1e2025] rounded' />
                    <div className='h-3 w-20 bg-[#f0f0f0] dark:bg-[#1e2025] rounded' />
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
              <p className='text-sm text-red-400'>Search failed. Try again.</p>
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
                    'flex items-center gap-3 p-3 cursor-pointer transition-colors border-0 bg-transparent w-full text-left',
                    index === activeIndex
                      ? 'bg-[#f0f0f0] dark:bg-[#1e2025]'
                      : 'hover:bg-[#f0f0f0]/50 dark:hover:bg-[#1e2025]/50'
                  )}
                  onClick={() => handleArtistSelect(artist)}
                  onKeyDown={event =>
                    handleActivationKeyDown(event, () =>
                      handleArtistSelect(artist)
                    )
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <div className='w-10 h-10 rounded-full bg-[#f0f0f0] dark:bg-[#1e2025] overflow-hidden shrink-0 relative'>
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
                          className='w-5 h-5 text-[#6b6f76]'
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
                    <div className='shrink-0 text-[#1DB954]'>
                      <svg
                        className='w-4 h-4'
                        viewBox='0 0 20 20'
                        fill='currentColor'
                        aria-hidden='true'
                      >
                        <path
                          fillRule='evenodd'
                          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                          clipRule='evenodd'
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Always-visible "Manually add URL" option */}
          <button
            type='button'
            tabIndex={0}
            className={cn(
              'flex items-center gap-3 p-3 cursor-pointer transition-colors border-t border-[#d7d9de] dark:border-[#2c2e33] border-l-0 border-r-0 border-b-0 bg-transparent w-full text-left',
              activeIndex === manualAddIndex
                ? 'bg-[#f0f0f0] dark:bg-[#1e2025]'
                : 'hover:bg-[#f0f0f0]/50 dark:hover:bg-[#1e2025]/50'
            )}
            onClick={handleManualAddClick}
            onKeyDown={event =>
              handleActivationKeyDown(event, () => handleManualAddClick())
            }
            onMouseEnter={() => setActiveIndex(manualAddIndex)}
          >
            <div className='w-10 h-10 rounded-full bg-[#f0f0f0] dark:bg-[#1e2025] flex items-center justify-center'>
              <svg
                className='w-5 h-5 text-[#6b6f76]'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}
                aria-hidden='true'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
                />
              </svg>
            </div>
            <div className='flex-1'>
              <div className='font-medium text-primary-token'>
                Manually add URL
              </div>
              <div className='text-xs text-tertiary-token'>
                Paste a Spotify artist link
              </div>
            </div>
          </button>
        </div>
      )}

      <div className={FORM_LAYOUT.errorContainer}>
        {fieldErrors.spotifyUrl && (
          <p
            id='waitlist-spotify-url-error'
            role='alert'
            className='text-sm text-red-400'
          >
            {fieldErrors.spotifyUrl[0]}
          </p>
        )}
      </div>
    </div>
  );
}
