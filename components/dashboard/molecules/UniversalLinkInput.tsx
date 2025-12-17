'use client';

import {
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/20/solid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
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

import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import {
  type SpotifyArtistResult,
  useArtistSearch,
} from '@/lib/hooks/useArtistSearch';
import { cn } from '@/lib/utils';
import { isBrandDark } from '@/lib/utils/color';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

const ARTIST_SEARCH_PLATFORMS = [
  {
    id: 'spotify-artist',
    name: 'Spotify Artist',
    icon: 'spotify',
    searchMode: true,
    provider: 'spotify' as const,
  },
] as const;

type ArtistSearchProvider =
  (typeof ARTIST_SEARCH_PLATFORMS)[number]['provider'];

type UniversalLinkMode =
  | { type: 'url' }
  | { type: 'artist-search'; provider: ArtistSearchProvider };

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
  existingPlatforms?: string[];
  prefillUrl?: string;
  onPrefillConsumed?: () => void;
  creatorName?: string;
  onQueryChange?: (value: string) => void;
  onPreviewChange?: (link: DetectedLink | null, isDuplicate: boolean) => void;
  clearSignal?: number;
}

export interface UniversalLinkInputRef {
  getInputElement: () => HTMLInputElement | null;
}

function useInputFocus(targetRef: React.RefObject<HTMLInputElement>) {
  const rafRef = useRef<number>();

  const focusAtEnd = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const input = targetRef.current;
      if (!input) return;
      input.focus();
      const endPos = input.value.length;
      input.setSelectionRange(endPos, endPos);
    });
  }, [targetRef]);

  const focus = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      targetRef.current?.focus();
    });
  }, [targetRef]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return { focusAtEnd, focus };
}

interface PlatformSelectorProps {
  currentPlatformIcon: string;
  onPlatformSelect: (platform: (typeof PLATFORM_OPTIONS)[number]) => void;
  onArtistSearchSelect: (provider: ArtistSearchProvider) => void;
  focusInput: () => void;
  focusInputEnd: () => void;
  disabled?: boolean;
}

function PlatformSelector({
  currentPlatformIcon,
  onPlatformSelect,
  onArtistSearchSelect,
  focusInput,
  focusInputEnd,
  disabled,
}: PlatformSelectorProps) {
  const currentIconMeta = getPlatformIcon(currentPlatformIcon);
  const neutralHex = '#6b7280';
  const selectorBrand = currentIconMeta?.hex
    ? `#${currentIconMeta.hex}`
    : neutralHex;
  const selectorIconBg = isBrandDark(selectorBrand)
    ? 'rgba(255,255,255,0.12)'
    : `${selectorBrand}1f`;
  const selectorIconColor = isBrandDark(selectorBrand)
    ? '#ffffff'
    : selectorBrand;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type='button'
          className={cn(
            'relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-2 transition-colors shrink-0 p-0',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:z-10',
            disabled && 'opacity-50'
          )}
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
          <ChevronDownIcon
            className='absolute right-1 top-1 h-3 w-3 text-tertiary-token'
            aria-hidden='true'
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='start'
        className='max-h-80 overflow-y-auto'
        onCloseAutoFocus={event => {
          event.preventDefault();
          focusInputEnd();
        }}
      >
        {ARTIST_SEARCH_PLATFORMS.map(platform => {
          const meta = getPlatformIcon(platform.icon);
          const hex = meta?.hex ? `#${meta.hex}` : selectorBrand;
          return (
            <DropdownMenuItem
              key={platform.id}
              onSelect={() => {
                onArtistSearchSelect(platform.provider);
                focusInput();
              }}
              className='flex items-center gap-2 cursor-pointer py-1.5 text-[13px]'
            >
              <div
                className='flex items-center justify-center w-5 h-5 rounded'
                style={{
                  backgroundColor: hex,
                  color: '#ffffff',
                }}
              >
                <SocialIcon platform={platform.icon} className='w-3 h-3' />
              </div>
              <span>{platform.name}</span>
              <MagnifyingGlassIcon className='w-3 h-3 text-tertiary-token ml-auto' />
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        {PLATFORM_OPTIONS.map(platform => {
          const meta = getPlatformIcon(platform.icon);
          const hex = meta?.hex ? `#${meta.hex}` : selectorBrand;
          return (
            <DropdownMenuItem
              key={platform.id}
              onSelect={() => {
                onPlatformSelect(platform);
                focusInputEnd();
              }}
              className='flex items-center gap-2 cursor-pointer py-1.5 text-[13px]'
            >
              <div
                className='flex items-center justify-center w-5 h-5 rounded'
                style={{
                  backgroundColor: hex,
                  color: '#ffffff',
                }}
              >
                <SocialIcon platform={platform.icon} className='w-3 h-3' />
              </div>
              <span>{platform.name}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface UrlModeProps {
  url: string;
  placeholder: string;
  disabled?: boolean;
  detectedLink: DetectedLink | null;
  isPlatformDuplicate: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onClear: () => void;
  platformIcon: string;
  selector: React.ReactNode;
}

function UrlMode({
  url,
  placeholder,
  disabled,
  detectedLink,
  isPlatformDuplicate,
  onChange,
  onKeyDown,
  onClear,
  platformIcon,
  selector,
}: UrlModeProps) {
  const brandColor = detectedLink?.platform.color
    ? `#${detectedLink.platform.color}`
    : 'rgb(var(--border-subtle))';
  const isDarkBrand = isBrandDark(brandColor);
  const iconColor = isDarkBrand ? '#ffffff' : brandColor;
  const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

  return (
    <div className='relative w-full'>
      <div
        className={cn(
          'relative flex w-full items-center gap-2 rounded-full border border-default bg-surface-1 px-2 py-1 shadow-xs transition-colors',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
          disabled && 'opacity-50'
        )}
      >
        {selector}

        <label htmlFor='link-url-input' className='sr-only'>
          Link URL
        </label>
        <Input
          id='link-url-input'
          type='url'
          inputSize='lg'
          placeholder={placeholder}
          value={url}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={disabled}
          inputMode='url'
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='border-0 bg-transparent px-0 pr-24 focus-visible:ring-0 focus-visible:ring-offset-0'
          aria-describedby={detectedLink ? 'link-detection-status' : undefined}
        />

        {url && (
          <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
            {detectedLink && (
              <div
                className='flex items-center justify-center w-6 h-6 rounded-full'
                style={{
                  backgroundColor: iconBg,
                  color: iconColor,
                }}
                aria-hidden='true'
              >
                <SocialIcon platform={platformIcon} className='w-3 h-3' />
              </div>
            )}
            <button
              type='button'
              onClick={onClear}
              className='flex items-center justify-center w-5 h-5 rounded-full text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
              aria-label='Clear input'
            >
              <XMarkIcon className='w-4 h-4' />
            </button>
          </div>
        )}
      </div>

      <div id='link-detection-status' className='sr-only' aria-live='polite'>
        {detectedLink
          ? detectedLink.isValid
            ? `${detectedLink.platform.name} link detected. Title set automatically based on your profile and URL. You can now add this link.`
            : `Invalid ${detectedLink.platform.name} link. ${detectedLink.error || 'Please check the URL.'}`
          : url
            ? 'No valid link detected. Please enter a valid URL.'
            : ''}
      </div>

      {url && !detectedLink?.isValid && (
        <div className='hidden text-xs text-secondary-token' role='status'>
          💡 Paste links from Spotify, Instagram, TikTok, YouTube, and more for
          automatic detection
        </div>
      )}

      {isPlatformDuplicate && (
        <p className='mt-2 text-xs text-warning-token'>
          This platform has already been added.
        </p>
      )}
    </div>
  );
}

interface ArtistSearchModeProps {
  provider: ArtistSearchProvider;
  searchQuery: string;
  searchState: ReturnType<typeof useArtistSearch>['state'];
  searchError: string | null;
  artistResults: SpotifyArtistResult[];
  activeResultIndex: number;
  showResults: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onFocus: () => void;
  onBlur: () => void;
  onExit: () => void;
  onArtistSelect: (artist: SpotifyArtistResult) => void;
  setActiveResultIndex: (index: number) => void;
  resultsListRef: React.RefObject<HTMLUListElement>;
  inputRef: React.RefObject<HTMLInputElement>;
}

function ArtistSearchMode({
  provider,
  searchQuery,
  searchState,
  searchError,
  artistResults,
  activeResultIndex,
  showResults,
  disabled,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  onExit,
  onArtistSelect,
  setActiveResultIndex,
  resultsListRef,
  inputRef,
}: ArtistSearchModeProps) {
  const searchPlatform = ARTIST_SEARCH_PLATFORMS.find(
    p => p.provider === provider
  );
  const iconMeta = getPlatformIcon(searchPlatform?.icon || 'spotify');
  const brandHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#a855f7';
  const isDarkBrand = isBrandDark(brandHex);
  const iconColor = isDarkBrand ? '#ffffff' : brandHex;
  const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandHex}15`;

  return (
    <div className='relative w-full'>
      <div
        className={cn(
          'relative flex w-full items-center gap-2 rounded-full border border-default bg-surface-1 px-2 py-1 shadow-xs transition-colors',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
          disabled && 'opacity-50'
        )}
      >
        <div className='flex h-10 w-10 items-center justify-center rounded-full shrink-0'>
          <div
            className='flex items-center justify-center w-6 h-6 rounded-full'
            style={{ backgroundColor: iconBg, color: iconColor }}
            aria-hidden='true'
          >
            <SocialIcon
              platform={searchPlatform?.icon || 'spotify'}
              className='w-3.5 h-3.5'
            />
          </div>
        </div>

        <label htmlFor='artist-search-input' className='sr-only'>
          Search {searchPlatform?.name ?? 'artists'}
        </label>
        <Input
          ref={inputRef}
          id='artist-search-input'
          type='text'
          inputSize='lg'
          placeholder='Search Spotify artists...'
          value={searchQuery}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          disabled={disabled}
          autoCapitalize='none'
          autoCorrect='off'
          autoComplete='off'
          className='border-0 bg-transparent px-0 pr-14 focus-visible:ring-0 focus-visible:ring-offset-0'
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

        <div className='absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2'>
          {searchState === 'loading' && (
            <div className='w-4 h-4 border-2 border-tertiary-token border-t-transparent rounded-full animate-spin' />
          )}
          <button
            type='button'
            onClick={onExit}
            className='flex items-center justify-center w-5 h-5 rounded-full text-tertiary-token hover:text-secondary-token hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0'
            aria-label='Exit search mode'
          >
            <XMarkIcon className='w-4 h-4' />
          </button>
        </div>
      </div>

      {showResults && (
        <div
          className='absolute z-50 w-full mt-1 rounded-lg border border-subtle bg-surface-1 shadow-lg overflow-hidden'
          style={{ borderColor: `${brandHex}30` }}
        >
          {searchState === 'loading' && artistResults.length === 0 && (
            <div className='p-3 space-y-2'>
              {[...Array(3)].map((_, i) => (
                <div key={i} className='flex items-center gap-3 animate-pulse'>
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
              <p className='text-sm text-secondary-token'>No artists found</p>
              <button
                type='button'
                onClick={onExit}
                className='mt-2 text-xs text-accent hover:underline'
              >
                Add link manually
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
                onClick={onExit}
                className='mt-2 text-xs text-accent hover:underline'
              >
                Add link manually
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
                  onClick={() => onArtistSelect(artist)}
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
                    <div className='shrink-0 text-accent'>
                      <svg
                        className='w-4 h-4'
                        viewBox='0 0 20 20'
                        fill='currentColor'
                      >
                        <path
                          fillRule='evenodd'
                          d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
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

      <div id='artist-search-status' className='sr-only' aria-live='polite'>
        {searchState === 'loading' && 'Searching...'}
        {searchState === 'empty' && 'No artists found'}
        {searchState === 'error' && (searchError || 'Search failed')}
        {searchState === 'success' &&
          `${artistResults.length} artists found. Use arrow keys to navigate.`}
      </div>
    </div>
  );
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
      onPreviewChange,
      clearSignal = 0,
    },
    forwardedRef
  ) => {
    const inputWrapperRef = useRef<HTMLDivElement>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const { focusAtEnd, focus } = useInputFocus(urlInputRef);

    const [mode, setMode] = useState<UniversalLinkMode>({ type: 'url' });
    const [url, setUrl] = useState('');

    const onPreviewChangeRef = useRef<
      ((link: DetectedLink | null, isDuplicate: boolean) => void) | undefined
    >(onPreviewChange);

    useEffect(() => {
      onPreviewChangeRef.current = onPreviewChange;
    }, [onPreviewChange]);

    const [searchQuery, setSearchQuery] = useState('');
    const [showResults, setShowResults] = useState(false);
    const [activeResultIndex, setActiveResultIndex] = useState(-1);
    const resultsListRef = useRef<HTMLUListElement>(null);

    const {
      results: artistResults,
      state: searchState,
      error: searchError,
      search: searchArtists,
      clear: clearSearch,
    } = useArtistSearch({ debounceMs: 300, limit: 5 });

    useEffect(() => {
      if (prefillUrl && !url && mode.type === 'url') {
        if (prefillUrl.startsWith('__SEARCH_MODE__:')) {
          const provider = prefillUrl.split(':')[1] as ArtistSearchProvider;
          if (provider === 'spotify') {
            setMode({ type: 'artist-search', provider });
            setUrl('');
            setSearchQuery('');
            clearSearch();
            onPrefillConsumed?.();
            onQueryChange?.('');
            focus();
            return;
          }
        }

        setUrl(prefillUrl);
        onPrefillConsumed?.();
        onQueryChange?.(prefillUrl);
        focusAtEnd();
      }
    }, [
      clearSearch,
      focus,
      focusAtEnd,
      mode.type,
      onPrefillConsumed,
      onQueryChange,
      prefillUrl,
      url,
    ]);

    const detectedLink = useMemo(() => {
      const trimmed = url.trim();
      if (!trimmed) return null;
      const lowered = trimmed.toLowerCase();
      const unsafePrefixes = [
        'javascript:',
        'data:',
        'vbscript:',
        'file:',
        'mailto:',
      ];
      const hasEncodedControl = /%(0a|0d|09|00)/i.test(lowered);
      if (
        unsafePrefixes.some(prefix => lowered.startsWith(prefix)) ||
        hasEncodedControl
      ) {
        return null;
      }
      return detectPlatform(trimmed, creatorName);
    }, [url, creatorName]);

    const handleUrlChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setUrl(value);
        onQueryChange?.(value);
      },
      [onQueryChange]
    );

    const handleAdd = useCallback(() => {
      if (!detectedLink || !detectedLink.isValid) return;

      const linkToAdd = {
        ...detectedLink,
      };

      onAdd(linkToAdd);

      setUrl('');
      onQueryChange?.('');
      focus();
    }, [detectedLink, onAdd, onQueryChange, focus]);

    const handleClear = useCallback(() => {
      setUrl('');
      onQueryChange?.('');
      focus();
    }, [focus, onQueryChange]);

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
      : '#6b7280';
    const isDarkBrand = isBrandDark(brandColor);
    const iconColor = isDarkBrand ? '#ffffff' : brandColor;
    const iconBg = isDarkBrand ? 'rgba(255,255,255,0.08)' : `${brandColor}15`;

    const isPlatformDuplicate = detectedLink
      ? existingPlatforms.includes(detectedLink.platform.id)
      : false;

    useEffect(() => {
      const callback = onPreviewChangeRef.current;
      if (!callback) return;
      if (!detectedLink || !detectedLink.isValid) {
        callback(null, false);
        return;
      }
      callback(detectedLink, isPlatformDuplicate);
    }, [detectedLink, isPlatformDuplicate]);

    useEffect(() => {
      if (!clearSignal) return;
      handleClear();
    }, [clearSignal, handleClear]);

    useImperativeHandle(forwardedRef, () => ({
      getInputElement: () => urlInputRef.current,
    }));

    const handleArtistSelect = useCallback(
      (artist: SpotifyArtistResult) => {
        track('spotify_artist_select', {
          artist_id: artist.id,
          artist_name: artist.name,
          followers: artist.followers,
          result_count: artistResults.length,
        });

        const link = detectPlatform(artist.url, creatorName);
        if (link && link.isValid) {
          const enrichedLink = {
            ...link,
            suggestedTitle: artist.name,
          };
          onAdd(enrichedLink);
        }

        setMode({ type: 'url' });
        setSearchQuery('');
        setShowResults(false);
        setActiveResultIndex(-1);
        clearSearch();
        setUrl('');
        onQueryChange?.('');
        focus();
      },
      [
        artistResults.length,
        clearSearch,
        creatorName,
        focus,
        onAdd,
        onQueryChange,
      ]
    );

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

    const exitSearchMode = useCallback(() => {
      setMode({ type: 'url' });
      setSearchQuery('');
      setShowResults(false);
      setActiveResultIndex(-1);
      clearSearch();
      setUrl('https://open.spotify.com/artist/');
      onQueryChange?.('https://open.spotify.com/artist/');
      focusAtEnd();
    }, [clearSearch, focusAtEnd, onQueryChange]);

    const handleSearchKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!showResults || artistResults.length === 0) {
          if (e.key === 'Escape') {
            e.preventDefault();
            exitSearchMode();
          } else if (e.key === 'Enter' && searchQuery) {
            e.preventDefault();
            searchArtists(searchQuery);
            setShowResults(true);
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
        searchArtists,
        searchQuery,
      ]
    );

    useEffect(() => {
      if (activeResultIndex >= 0 && resultsListRef.current) {
        const activeItem = resultsListRef.current.children[
          activeResultIndex
        ] as HTMLElement;
        activeItem?.scrollIntoView({ block: 'nearest' });
      }
    }, [activeResultIndex]);

    const handlePlatformSelect = useCallback(
      (platform: (typeof PLATFORM_OPTIONS)[number]) => {
        let handle = '';
        try {
          if (url.trim()) {
            const parsed = new URL(
              url.startsWith('http') ? url : `https://${url}`
            );
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            if (pathParts.length > 0) {
              handle = pathParts[pathParts.length - 1];
            }
          }
        } catch {
          const lastSlash = url.lastIndexOf('/');
          if (lastSlash !== -1 && lastSlash < url.length - 1) {
            handle = url.slice(lastSlash + 1);
          }
        }

        const newUrl = platform.prefill + handle;
        setUrl(newUrl);
        onQueryChange?.(newUrl);
        focusAtEnd();
      },
      [focusAtEnd, onQueryChange, url]
    );

    const handleArtistSearchSelect = useCallback(
      (provider: ArtistSearchProvider) => {
        track('spotify_artist_search_start', { provider });

        setMode({ type: 'artist-search', provider });
        setUrl('');
        setSearchQuery('');
        clearSearch();
        setShowResults(false);
        setActiveResultIndex(-1);
        onQueryChange?.('');
        focus();
      },
      [clearSearch, focus, onQueryChange]
    );

    const currentPlatformIcon = detectedLink?.platform.icon || 'globe';

    return (
      <div className='relative w-full' ref={inputWrapperRef}>
        {mode.type === 'artist-search' ? (
          <ArtistSearchMode
            provider={mode.provider}
            searchQuery={searchQuery}
            searchState={searchState}
            searchError={searchError}
            artistResults={artistResults}
            activeResultIndex={activeResultIndex}
            showResults={showResults}
            disabled={disabled}
            onChange={handleSearchInputChange}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
            onBlur={() => {
              setTimeout(() => setShowResults(false), 120);
            }}
            onExit={exitSearchMode}
            onArtistSelect={handleArtistSelect}
            setActiveResultIndex={setActiveResultIndex}
            resultsListRef={resultsListRef}
            inputRef={urlInputRef}
          />
        ) : (
          <UrlMode
            url={url}
            placeholder={placeholder}
            disabled={disabled}
            detectedLink={detectedLink}
            isPlatformDuplicate={isPlatformDuplicate}
            onChange={handleUrlChange}
            onKeyDown={handleKeyDown}
            onClear={handleClear}
            platformIcon={currentPlatformIcon}
            selector={
              <PlatformSelector
                currentPlatformIcon={currentPlatformIcon}
                onPlatformSelect={handlePlatformSelect}
                onArtistSearchSelect={handleArtistSearchSelect}
                focusInput={focus}
                focusInputEnd={focusAtEnd}
                disabled={disabled}
              />
            }
          />
        )}

        {mode.type === 'url' && detectedLink && detectedLink.isValid && (
          <div className='mt-3 flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 shadow-sm'>
            <div
              className='flex items-center justify-center w-8 h-8 rounded-full'
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
              <div className='font-medium text-primary-token truncate'>
                {detectedLink.platform.name}
              </div>
              <div className='text-xs text-tertiary-token truncate'>
                {detectedLink.suggestedTitle || detectedLink.platform.name}
              </div>
              {isPlatformDuplicate && (
                <p className='text-xs text-warning-token mt-1'>
                  This platform is already added.
                </p>
              )}
            </div>
            <button
              type='button'
              onClick={handleAdd}
              disabled={isPlatformDuplicate}
              tabIndex={-1}
              className='rounded-full bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed'
            >
              Add
            </button>
          </div>
        )}
      </div>
    );
  }
);

UniversalLinkInput.displayName = 'UniversalLinkInput';
