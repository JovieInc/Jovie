'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatformIconMetadata } from '@/components/atoms/SocialIcon';
import { track } from '@/lib/analytics';
import { type SpotifyArtistResult, useArtistSearchQuery } from '@/lib/queries';
import { isBrandDark } from '@/lib/utils/color';
import { detectPlatform } from '@/lib/utils/platform-detection';
import { ARTIST_SEARCH_PLATFORMS } from '../universalLinkInput.constants';
import type { ArtistSearchModeProps } from './types';

interface UseArtistSearchModeOptions
  extends Pick<
    ArtistSearchModeProps,
    | 'provider'
    | 'creatorName'
    | 'onSelect'
    | 'onExit'
    | 'onQueryChange'
    | 'focusInput'
  > {}

interface UseArtistSearchModeReturn {
  // State
  searchQuery: string;
  showResults: boolean;
  activeResultIndex: number;
  results: SpotifyArtistResult[];
  state: 'idle' | 'loading' | 'success' | 'empty' | 'error';
  error: string | null;

  // Refs
  resultsListRef: React.RefObject<HTMLDivElement | null>;

  // Platform styling
  searchPlatform: (typeof ARTIST_SEARCH_PLATFORMS)[number] | undefined;
  brandHex: string;
  iconColor: string;
  iconBg: string;

  // Handlers
  handleSearchInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleArtistSelect: (artist: SpotifyArtistResult) => void;
  exitSearchMode: () => void;
  setActiveResultIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowResults: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Hook to manage artist search mode state and handlers.
 */
export function useArtistSearchMode({
  provider,
  creatorName,
  onSelect,
  onExit,
  onQueryChange,
  focusInput,
}: UseArtistSearchModeOptions): UseArtistSearchModeReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);

  const resultsListRef = useRef<HTMLDivElement>(null);

  const { results, state, error, search, clear } = useArtistSearchQuery({
    debounceMs: 300,
    limit: 5,
  });

  const searchPlatform = useMemo(
    () =>
      ARTIST_SEARCH_PLATFORMS.find(platform => platform.provider === provider),
    [provider]
  );
  const platformIcon = getPlatformIconMetadata(
    searchPlatform?.icon || 'spotify'
  );
  const brandHex = platformIcon?.hex ? `#${platformIcon.hex}` : '#1DB954';
  const iconIsDark = isBrandDark(brandHex);
  const iconColor = iconIsDark ? '#ffffff' : brandHex;
  const iconBg = iconIsDark ? 'rgba(255,255,255,0.08)' : `${brandHex}15`;

  useEffect(() => {
    setSearchQuery('');
    setActiveResultIndex(-1);
    setShowResults(false);
    clear();
    focusInput('start');
  }, [clear, focusInput, provider]);

  const handleArtistSelect = useCallback(
    (artist: SpotifyArtistResult) => {
      track('spotify_artist_select', {
        artist_id: artist.id,
        artist_name: artist.name,
        followers: artist.followers,
        result_count: results.length,
      });

      const link = detectPlatform(artist.url, creatorName);
      if (link?.isValid) {
        const enrichedLink = {
          ...link,
          suggestedTitle: artist.name,
        };
        onSelect(enrichedLink);
      }

      setSearchQuery('');
      setShowResults(false);
      setActiveResultIndex(-1);
      clear();
      onQueryChange?.('');
      focusInput('end');
      onExit('https://open.spotify.com/artist/');
    },
    [
      clear,
      creatorName,
      focusInput,
      onExit,
      onQueryChange,
      onSelect,
      results.length,
    ]
  );

  const handleSearchInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      setActiveResultIndex(-1);
      search(value);
      setShowResults(true);
    },
    [search]
  );

  const exitSearchMode = useCallback(() => {
    setSearchQuery('');
    setShowResults(false);
    setActiveResultIndex(-1);
    clear();
    focusInput('end');
    onExit('https://open.spotify.com/artist/');
  }, [clear, focusInput, onExit]);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showResults || results.length === 0) {
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
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveResultIndex(prev =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (activeResultIndex >= 0 && results[activeResultIndex]) {
            handleArtistSelect(results[activeResultIndex]);
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
      activeResultIndex,
      exitSearchMode,
      handleArtistSelect,
      results,
      showResults,
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

  return {
    searchQuery,
    showResults,
    activeResultIndex,
    results,
    state,
    error,
    resultsListRef,
    searchPlatform,
    brandHex,
    iconColor,
    iconBg,
    handleSearchInputChange,
    handleSearchKeyDown,
    handleArtistSelect,
    exitSearchMode,
    setActiveResultIndex,
    setShowResults,
  };
}
