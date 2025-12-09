'use client';

import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import Image from 'next/image';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Input } from '@/components/atoms/Input';
import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import {
  type SpotifyArtistResult,
  useArtistSearch,
} from '@/lib/hooks/useArtistSearch';
import { isBrandDark } from '@/lib/utils/color';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

// Special search mode platforms
const ARTIST_SEARCH_PLATFORMS = [
  {
    id: 'spotify-artist',
    name: 'Spotify Artist',
    icon: 'spotify',
    searchMode: true,
    provider: 'spotify' as const,
  },
  // Apple Music can be added here later
] as const;

type ArtistSearchProvider =
  (typeof ARTIST_SEARCH_PLATFORMS)[number]['provider'];

// Platform options for the dropdown selector
const PLATFORM_OPTIONS = [
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'spotify',
    prefill: 'https://open.spotify.com/artist/',
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    icon: 'applemusic',
    prefill: 'https://music.apple.com/artist/',
  },
  {
    id: 'youtube-music',
    name: 'YouTube Music',
    icon: 'youtube',
    prefill: 'https://music.youtube.com/channel/',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    prefill: 'https://instagram.com/',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'tiktok',
    prefill: 'https://www.tiktok.com/@',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    prefill: 'https://www.youtube.com/@',
  },
  { id: 'twitter', name: 'X (Twitter)', icon: 'x', prefill: 'https://x.com/' },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    prefill: 'https://facebook.com/',
  },
  {
    id: 'soundcloud',
    name: 'SoundCloud',
    icon: 'soundcloud',
    prefill: 'https://soundcloud.com/',
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: 'twitch',
    prefill: 'https://twitch.tv/',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin',
    prefill: 'https://linkedin.com/in/',
  },
  { id: 'venmo', name: 'Venmo', icon: 'venmo', prefill: 'https://venmo.com/' },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'discord',
    prefill: 'https://discord.gg/',
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: 'threads',
    prefill: 'https://threads.net/@',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'telegram',
    prefill: 'https://t.me/',
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    icon: 'snapchat',
    prefill: 'https://snapchat.com/add/',
  },
  { id: 'website', name: 'Website', icon: 'globe', prefill: 'https://' },
] as const;

// Format follower count for display
function formatFollowers(count: number | undefined): string {
  if (!count) return '';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M followers`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K followers`;
  return `${count} followers`;
}

interface UniversalLinkInputProps {
  onAdd: (link: DetectedLink) => void;
  placeholder?: string;
  disabled?: boolean;
  existingPlatforms?: string[]; // Array of existing platform IDs to check for duplicates
  prefillUrl?: string; // optional prefill
  onPrefillConsumed?: () => void; // notify parent once we consume it
  creatorName?: string; // Creator's name for personalized link titles
  onQueryChange?: (value: string) => void; // mirror URL value for filtering/search
}

export interface UniversalLinkInputRef {
  getInputElement: () => HTMLInputElement | null;
}

export const UniversalLinkInput = forwardRef<
  UniversalLinkInputRef,
  UniversalLinkInputProps
>(
  (
    {
      onAdd,
      placeholder = 'Paste any link (Spotify, Instagram, TikTok, etc.)',
      disabled = false,
      existingPlatforms = [],
      prefillUrl,
      onPrefillConsumed,
      creatorName,
      onQueryChange,
    },
    forwardedRef
  ) => {
    const [url, setUrl] = useState('');
    const inputRef = useRef<HTMLDivElement>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);

    // Artist search mode state
    const [searchMode, setSearchMode] = useState<ArtistSearchProvider | null>(
      null
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [activeResultIndex, setActiveResultIndex] = useState(-1);
    const resultsListRef = useRef<HTMLUListElement>(null);

    // Artist search hook
    const {
      results: artistResults,
      state: searchState,
      error: searchError,
      search: searchArtists,
      clear: clearSearch,
    } = useArtistSearch({ debounceMs: 300, limit: 5 });

    // If parent provides a prefill URL and we are empty, consume it once
    useEffect(() => {
      if (prefillUrl && !url && !searchMode) {
        // Check for special search mode marker
        if (prefillUrl.startsWith('__SEARCH_MODE__:')) {
          const provider = prefillUrl.split(':')[1] as ArtistSearchProvider;
          if (provider === 'spotify') {
            setSearchMode(provider);
            setUrl('');
            setSearchQuery('');
            clearSearch();
            onPrefillConsumed?.();
            onQueryChange?.('');
            setTimeout(() => {
              urlInputRef.current?.focus();
            }, 0);
            return;
          }
        }

        setUrl(prefillUrl);
        onPrefillConsumed?.();
        onQueryChange?.(prefillUrl);
        // Focus input and position cursor at the end
        setTimeout(() => {
          const input = urlInputRef.current;
          if (input) {
            input.focus();
            // Position cursor at end of prefilled text
            const len = prefillUrl.length;
            input.setSelectionRange(len, len);
          }
        }, 0);
      }
      // Only react to changes of prefillUrl when url is empty to avoid overriding user typing
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefillUrl]);

    // Real-time platform detection (uses creatorName for better SEO titles)
    const detectedLink = useMemo(() => {
      if (!url.trim()) return null;
      return detectPlatform(url.trim(), creatorName);
    }, [url, creatorName]);

    // Handle URL input changes (also used as combined search query)
    const handleUrlChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setUrl(value);
        onQueryChange?.(value);
      },
      [onQueryChange]
    );

    // Add link handler
    const handleAdd = useCallback(() => {
      if (!detectedLink || !detectedLink.isValid) return;

      const linkToAdd = {
        ...detectedLink,
      };

      onAdd(linkToAdd);

      // Reset form
      setUrl('');
      onQueryChange?.('');

      // Auto-focus the URL input after adding a link
      setTimeout(() => {
        inputRef.current?.querySelector('input')?.focus();
      }, 50);
    }, [detectedLink, onAdd, onQueryChange]);

    // Clear/cancel handler
    const handleClear = useCallback(() => {
      setUrl('');
      onQueryChange?.('');
      // Refocus input after clearing
      setTimeout(() => {
        urlInputRef.current?.focus();
      }, 0);
    }, [onQueryChange]);

    // Handle keyboard interactions
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && detectedLink?.isValid) {
          e.preventDefault();
          handleAdd();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleClear();
        }
      },
      [handleAdd, detectedLink, handleClear]
    );

    const brandColor = detectedLink?.platform.color
      ? `#${detectedLink.platform.color}`
      : '#6b7280'; // fallback gray-500

    // Use shared color utilities for brand icon styling
    const isDarkBrand = isBrandDark(brandColor);
    const iconColor = isDarkBrand ? '#ffffff' : brandColor;
    const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

    // Check if this platform already exists
    const isPlatformDuplicate = detectedLink
      ? existingPlatforms.includes(detectedLink.platform.id)
      : false;

    useImperativeHandle(forwardedRef, () => ({
      getInputElement: () => urlInputRef.current,
    }));

    // Handle artist selection from search results
    const handleArtistSelect = useCallback(
      (artist: SpotifyArtistResult) => {
        // Track artist selection
        track('spotify_artist_select', {
          artist_id: artist.id,
          artist_name: artist.name,
          followers: artist.followers,
          result_count: artistResults.length,
        });

        // Create a detected link from the artist
        const link = detectPlatform(artist.url, creatorName);
        if (link && link.isValid) {
          // Override the title with the artist name
          const enrichedLink = {
            ...link,
            suggestedTitle: artist.name,
          };
          onAdd(enrichedLink);
        }

        // Exit search mode and reset
        setSearchMode(null);
        setSearchQuery('');
        setShowResults(false);
        setActiveResultIndex(-1);
        clearSearch();
        setUrl('');
        onQueryChange?.('');

        // Focus input after adding
        setTimeout(() => {
          urlInputRef.current?.focus();
        }, 50);
      },
      [artistResults.length, clearSearch, creatorName, onAdd, onQueryChange]
    );

    // Handle search input changes
    const handleSearchInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);
        setActiveResultIndex(-1);
        searchArtists(value);
        setShowResults(true);
      },
      [searchArtists]
    );

    // Exit search mode
    const exitSearchMode = useCallback(() => {
      setSearchMode(null);
      setSearchQuery('');
      setShowResults(false);
      setActiveResultIndex(-1);
      clearSearch();
      // Optionally prefill with Spotify URL base
      setUrl('https://open.spotify.com/artist/');
      onQueryChange?.('https://open.spotify.com/artist/');
      setTimeout(() => {
        const input = urlInputRef.current;
        if (input) {
          input.focus();
          const endPos = input.value.length;
          input.setSelectionRange(endPos, endPos);
        }
      }, 0);
    }, [clearSearch, onQueryChange]);

    // Handle keyboard navigation in search results
    const handleSearchKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!showResults || artistResults.length === 0) {
          if (e.key === 'Escape') {
            e.preventDefault();
            exitSearchMode();
          }
          return;
        }

        switch (e.key) {
          case 'ArrowDown':
            e.preventDefault();
            setActiveResultIndex(prev =>
              prev < artistResults.length - 1 ? prev + 1 : 0
            );
            break;
          case 'ArrowUp':
            e.preventDefault();
            setActiveResultIndex(prev =>
              prev > 0 ? prev - 1 : artistResults.length - 1
            );
            break;
          case 'Enter':
            e.preventDefault();
            if (activeResultIndex >= 0 && artistResults[activeResultIndex]) {
              handleArtistSelect(artistResults[activeResultIndex]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            if (showResults) {
              setShowResults(false);
              setActiveResultIndex(-1);
            } else {
              exitSearchMode();
            }
            break;
          case 'Tab':
            // Close results on tab
            setShowResults(false);
            setActiveResultIndex(-1);
            break;
        }
      },
      [
        showResults,
        artistResults,
        activeResultIndex,
        handleArtistSelect,
        exitSearchMode,
      ]
    );

    // Scroll active result into view
    useEffect(() => {
      if (activeResultIndex >= 0 && resultsListRef.current) {
        const activeItem = resultsListRef.current.children[
          activeResultIndex
        ] as HTMLElement;
        activeItem?.scrollIntoView({ block: 'nearest' });
      }
    }, [activeResultIndex]);

    // Handle platform selection from dropdown - prefill URL and focus at end
    const handlePlatformSelect = useCallback(
      (platform: (typeof PLATFORM_OPTIONS)[number]) => {
        const input = urlInputRef.current;

        // Try to extract the handle/username from current URL
        let handle = '';
        try {
          if (url.trim()) {
            const parsed = new URL(
              url.startsWith('http') ? url : `https://${url}`
            );
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            // Get the last meaningful path segment (usually the handle)
            if (pathParts.length > 0) {
              handle = pathParts[pathParts.length - 1];
            }
          }
        } catch {
          // If URL parsing fails, try to extract text after the last /
          const lastSlash = url.lastIndexOf('/');
          if (lastSlash !== -1 && lastSlash < url.length - 1) {
            handle = url.slice(lastSlash + 1);
          }
        }

        // Build new URL with the extracted handle
        const newUrl = platform.prefill + handle;
        setUrl(newUrl);
        onQueryChange?.(newUrl);

        // Focus input and position cursor at end so user can immediately type handle
        setTimeout(() => {
          if (input) {
            input.focus();
            const endPos = newUrl.length;
            input.setSelectionRange(endPos, endPos);
          }
        }, 0);
      },
      [onQueryChange, url]
    );

    // Handle artist search platform selection
    const handleArtistSearchSelect = useCallback(
      (provider: ArtistSearchProvider) => {
        // Track entering search mode
        track('spotify_artist_search_start', { provider });

        setSearchMode(provider);
        setUrl('');
        setSearchQuery('');
        clearSearch();
        setShowResults(false);
        setActiveResultIndex(-1);
        onQueryChange?.('');
        setTimeout(() => {
          urlInputRef.current?.focus();
        }, 0);
      },
      [clearSearch, onQueryChange]
    );

    // Get current platform icon for the selector (detected or default)
    const currentPlatformIcon = detectedLink?.platform.icon || 'globe';
    const currentIconMeta = getPlatformIcon(currentPlatformIcon);
    const currentIconHex = currentIconMeta?.hex
      ? `#${currentIconMeta.hex}`
      : '#6b7280';
    const currentIconIsDark = isBrandDark(currentIconHex);
    const selectorIconColor = currentIconIsDark ? '#ffffff' : currentIconHex;
    const selectorIconBg = currentIconIsDark
      ? 'rgba(255,255,255,0.08)'
      : `${currentIconHex}15`;

    // Render search mode UI
    if (searchMode) {
      const searchPlatform = ARTIST_SEARCH_PLATFORMS.find(
        p => p.provider === searchMode
      );
      const iconMeta = getPlatformIcon(searchPlatform?.icon || 'spotify');
      const brandHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#1DB954';
      const isDarkBrand = isBrandDark(brandHex);
      const iconColor = isDarkBrand ? '#ffffff' : brandHex;
      const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandHex}15`;

      return (
        <div className='relative w-full' ref={inputRef}>
          <div className='relative flex'>
            {/* Search mode indicator */}
            <div
              className='flex items-center gap-1 px-3 rounded-l-lg border border-r-0 border-subtle bg-surface-2 shrink-0'
              style={{ borderColor: `${brandHex}40` }}
            >
              <div
                className='flex items-center justify-center w-6 h-6 rounded-full'
                style={{ backgroundColor: iconBg, color: iconColor }}
              >
                <SocialIcon
                  platform={searchPlatform?.icon || 'spotify'}
                  className='w-3.5 h-3.5'
                />
              </div>
              <MagnifyingGlassIcon className='w-4 h-4 text-tertiary-token' />
            </div>

            <label htmlFor='artist-search-input' className='sr-only'>
              Search Spotify artists
            </label>
            <Input
              ref={urlInputRef}
              id='artist-search-input'
              type='text'
              placeholder='Search Spotify artists...'
              value={searchQuery}
              onChange={handleSearchInputChange}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
              onBlur={() => {
                // Delay to allow click on results
                setTimeout(() => setShowResults(false), 200);
              }}
              disabled={disabled}
              autoCapitalize='none'
              autoCorrect='off'
              autoComplete='off'
              className='pr-12 rounded-l-none'
              role='combobox'
              aria-expanded={showResults && artistResults.length > 0}
              aria-controls='artist-search-results'
              aria-activedescendant={
                activeResultIndex >= 0
                  ? `artist-result-${activeResultIndex}`
                  : undefined
              }
              aria-describedby='artist-search-status'
            />

            {/* Clear/exit button */}
            <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
              {searchState === 'loading' && (
                <div className='w-4 h-4 border-2 border-tertiary-token border-t-transparent rounded-full animate-spin' />
              )}
              <button
                type='button'
                onClick={exitSearchMode}
                className='flex items-center justify-center w-5 h-5 rounded-full text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
                aria-label='Exit search mode'
              >
                <XMarkIcon className='w-4 h-4' />
              </button>
            </div>
          </div>

          {/* Search results dropdown */}
          {showResults && (
            <div
              className='absolute z-50 w-full mt-1 rounded-lg border border-subtle bg-surface-1 shadow-lg overflow-hidden'
              style={{ borderColor: `${brandHex}30` }}
            >
              {searchState === 'loading' && artistResults.length === 0 && (
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

              {searchState === 'empty' && (
                <div className='p-4 text-center'>
                  <p className='text-sm text-secondary-token'>
                    No artists found
                  </p>
                  <button
                    type='button'
                    onClick={exitSearchMode}
                    className='mt-2 text-xs text-accent hover:underline'
                  >
                    Paste link instead
                  </button>
                </div>
              )}

              {searchState === 'error' && (
                <div className='p-4 text-center'>
                  <p className='text-sm text-red-500'>
                    {searchError || 'Search failed'}
                  </p>
                  <button
                    type='button'
                    onClick={exitSearchMode}
                    className='mt-2 text-xs text-accent hover:underline'
                  >
                    Paste link instead
                  </button>
                </div>
              )}

              {artistResults.length > 0 && (
                <ul
                  ref={resultsListRef}
                  id='artist-search-results'
                  role='listbox'
                  className='max-h-64 overflow-y-auto'
                >
                  {artistResults.map((artist, index) => (
                    <li
                      key={artist.id}
                      id={`artist-result-${index}`}
                      role='option'
                      aria-selected={index === activeResultIndex}
                      aria-label={`${artist.name}${artist.followers ? `, ${formatFollowers(artist.followers)}` : ''}`}
                      className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                        index === activeResultIndex
                          ? 'bg-surface-2'
                          : 'hover:bg-surface-2/50'
                      }`}
                      onClick={() => handleArtistSelect(artist)}
                      onMouseEnter={() => setActiveResultIndex(index)}
                    >
                      {/* Artist image */}
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

                      {/* Artist info */}
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

                      {/* Verified badge placeholder */}
                      {artist.verified && (
                        <div className='shrink-0 text-accent'>
                          <svg
                            className='w-4 h-4'
                            viewBox='0 0 20 20'
                            fill='currentColor'
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

          {/* Screen reader status */}
          <div id='artist-search-status' className='sr-only' aria-live='polite'>
            {searchState === 'loading' && 'Searching...'}
            {searchState === 'empty' && 'No artists found'}
            {searchState === 'error' && (searchError || 'Search failed')}
            {searchState === 'success' &&
              `${artistResults.length} artists found. Use arrow keys to navigate.`}
          </div>

          {/* Helper text */}
          <div className='mt-2 text-xs text-secondary-token'>
            💡 Select the official artist profile to ensure your link works
            correctly
          </div>
        </div>
      );
    }

    return (
      <div className='relative w-full' ref={inputRef}>
        {/* URL Input with platform selector */}
        <div className='relative flex'>
          {/* Platform selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className='flex items-center gap-1 px-3 rounded-l-lg border border-r-0 border-subtle bg-surface-2 hover:bg-surface-3 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:z-10'
                aria-label='Select platform'
              >
                <div
                  className='flex items-center justify-center w-6 h-6 rounded-full'
                  style={{
                    backgroundColor: selectorIconBg,
                    color: selectorIconColor,
                  }}
                >
                  <SocialIcon
                    platform={currentPlatformIcon}
                    className='w-3.5 h-3.5'
                  />
                </div>
                <ChevronDownIcon className='w-4 h-4 text-tertiary-token' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='start'
              className='max-h-80 overflow-y-auto'
              // Prevent Radix from refocusing the trigger; keep focus on URL input
              onCloseAutoFocus={event => {
                event.preventDefault();
                const input = urlInputRef.current;
                if (input) {
                  // Defer to ensure dropdown has fully closed before focusing
                  requestAnimationFrame(() => {
                    input.focus();
                    const endPos = input.value.length;
                    input.setSelectionRange(endPos, endPos);
                  });
                }
              }}
            >
              {/* Artist search options */}
              {ARTIST_SEARCH_PLATFORMS.map(platform => {
                const meta = getPlatformIcon(platform.icon);
                const hex = meta?.hex ? `#${meta.hex}` : '#6b7280';
                return (
                  <DropdownMenuItem
                    key={platform.id}
                    onSelect={() => handleArtistSearchSelect(platform.provider)}
                    className='flex items-center gap-2 cursor-pointer'
                  >
                    <div
                      className='flex items-center justify-center w-6 h-6 rounded-md'
                      style={{
                        backgroundColor: hex,
                        color: '#ffffff',
                      }}
                    >
                      <SocialIcon
                        platform={platform.icon}
                        className='w-3.5 h-3.5'
                      />
                    </div>
                    <span>{platform.name}</span>
                    <MagnifyingGlassIcon className='w-3 h-3 text-tertiary-token ml-auto' />
                  </DropdownMenuItem>
                );
              })}

              <DropdownMenuSeparator />

              {/* Regular platform options */}
              {PLATFORM_OPTIONS.map(platform => {
                const meta = getPlatformIcon(platform.icon);
                const hex = meta?.hex ? `#${meta.hex}` : '#6b7280';
                return (
                  <DropdownMenuItem
                    key={platform.id}
                    onSelect={() => handlePlatformSelect(platform)}
                    className='flex items-center gap-2 cursor-pointer'
                  >
                    <div
                      className='flex items-center justify-center w-6 h-6 rounded-md'
                      style={{
                        backgroundColor: hex,
                        color: '#ffffff',
                      }}
                    >
                      <SocialIcon
                        platform={platform.icon}
                        className='w-3.5 h-3.5'
                      />
                    </div>
                    <span>{platform.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <label htmlFor='link-url-input' className='sr-only'>
            Enter link URL
          </label>
          <Input
            ref={urlInputRef}
            id='link-url-input'
            type='url'
            placeholder={placeholder}
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            inputMode='url'
            autoCapitalize='none'
            autoCorrect='off'
            autoComplete='off'
            className='pr-24 rounded-l-none'
            aria-describedby={
              detectedLink ? 'link-detection-status' : undefined
            }
          />

          {/* Clear button and platform icon in input */}
          {url && (
            <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
              {/* Platform icon */}
              {detectedLink && (
                <div
                  className='flex items-center justify-center w-6 h-6 rounded-full'
                  style={{
                    backgroundColor: iconBg,
                    color: iconColor,
                  }}
                  aria-hidden='true'
                >
                  <SocialIcon
                    platform={detectedLink.platform.icon}
                    className='w-3 h-3'
                  />
                </div>
              )}
              {/* Clear/cancel button */}
              <button
                type='button'
                onClick={handleClear}
                className='flex items-center justify-center w-5 h-5 rounded-full text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
                aria-label='Clear input'
              >
                <XMarkIcon className='w-4 h-4' />
              </button>
            </div>
          )}
        </div>

        {/* Screen reader status */}
        <div id='link-detection-status' className='sr-only' aria-live='polite'>
          {detectedLink
            ? detectedLink.isValid
              ? `${detectedLink.platform.name} link detected. Title set automatically based on your profile and URL. You can now add this link.`
              : `Invalid ${detectedLink.platform.name} link. ${detectedLink.error || 'Please check the URL.'}`
            : url
              ? 'No valid link detected. Please enter a valid URL.'
              : ''}
        </div>

        {/* Link preview */}
        {detectedLink && (
          <div
            className={`-mt-px p-3 rounded-b-lg border border-t-0 transition-all duration-200 ${
              isPlatformDuplicate
                ? 'border-red-200 bg-red-50 dark:border-red-500/70 dark:bg-zinc-900/80'
                : detectedLink.isValid
                  ? 'border-gray-200 bg-gray-50 dark:border-zinc-700 dark:bg-zinc-900/80'
                  : 'border-red-200 bg-red-50/50 dark:border-red-500/70 dark:bg-zinc-900/80'
            }`}
            style={
              detectedLink.isValid && !isPlatformDuplicate
                ? { borderColor: `${brandColor}40` }
                : undefined
            }
            role='region'
            aria-label='Link preview'
          >
            <div className='flex items-start gap-3'>
              {/* Platform icon */}
              <div
                className='flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5'
                style={{
                  backgroundColor: iconBg,
                  color: iconColor,
                }}
                aria-hidden='true'
              >
                <SocialIcon
                  platform={detectedLink.platform.icon}
                  className='w-4 h-4'
                />
              </div>

              <div className='flex-1 min-w-0'>
                {/* Platform name - primary focus */}
                <div className='flex items-center gap-2'>
                  <span className='font-semibold text-base text-primary-token'>
                    {detectedLink.platform.name}
                  </span>
                  {detectedLink.isValid && !isPlatformDuplicate && (
                    <span className='text-green-500 text-xs'>
                      ✓ Ready to add
                    </span>
                  )}
                </div>

                {/* URL preview - secondary */}
                <div className='text-xs text-tertiary-token truncate mt-0.5'>
                  {detectedLink.normalizedUrl}
                </div>

                {/* Duplicate platform warning */}
                {isPlatformDuplicate && (
                  <div
                    className='text-xs text-amber-600 dark:text-amber-400 mt-2'
                    role='alert'
                  >
                    You already have a {detectedLink.platform.name} link. Adding
                    another may confuse visitors.
                  </div>
                )}

                {/* Validation error - friendly language */}
                {!detectedLink.isValid && detectedLink.error && (
                  <div
                    className='text-xs text-red-500 dark:text-red-400 mt-2'
                    role='alert'
                  >
                    {detectedLink.error}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className='flex items-center gap-2 shrink-0'>
                <button
                  type='button'
                  onClick={handleClear}
                  className='flex items-center justify-center w-8 h-8 rounded-lg text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
                  aria-label='Cancel'
                >
                  <XMarkIcon className='w-5 h-5' />
                </button>
                <Button
                  onClick={handleAdd}
                  disabled={
                    disabled || !detectedLink.isValid || isPlatformDuplicate
                  }
                  variant='primary'
                  size='sm'
                  aria-label={
                    isPlatformDuplicate
                      ? `Cannot add duplicate ${detectedLink.platform.name} link`
                      : `Add ${detectedLink.platform.name}`
                  }
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Validation hint */}
        {url && !detectedLink?.isValid && (
          <div className='text-xs text-secondary-token' role='status'>
            💡 Paste links from Spotify, Instagram, TikTok, YouTube, and more
            for automatic detection
          </div>
        )}
      </div>
    );
  }
);

UniversalLinkInput.displayName = 'UniversalLinkInput';
