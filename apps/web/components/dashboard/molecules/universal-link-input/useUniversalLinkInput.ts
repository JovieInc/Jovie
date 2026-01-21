'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

import {
  type ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from '../universalLinkInput.constants';
import { useInputFocusController } from '../useInputFocusController';
import type { PlatformOption, UseUniversalLinkInputReturn } from './types';
import {
  isUnsafeUrl,
  looksLikeUrlOrDomain,
  normalizeQuery,
  type RankedPlatformOption,
  rankPlatformOptions,
} from './utils';

interface UseUniversalLinkInputOptions {
  onAdd: (link: DetectedLink) => void;
  existingPlatforms: string[];
  creatorName?: string;
  onQueryChange?: (value: string) => void;
  onPreviewChange?: (link: DetectedLink | null, isDuplicate: boolean) => void;
  prefillUrl?: string;
  onPrefillConsumed?: () => void;
  clearSignal: number;
}

export function useUniversalLinkInput({
  onAdd,
  existingPlatforms,
  creatorName,
  onQueryChange,
  onPreviewChange,
  prefillUrl,
  onPrefillConsumed,
  clearSignal,
}: UseUniversalLinkInputOptions): UseUniversalLinkInputReturn {
  const [url, setUrl] = useState('');
  const [searchMode, setSearchMode] = useState<ArtistSearchProvider | null>(
    null
  );

  const [autosuggestOpen, setAutosuggestOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const autosuggestListId = useMemo(
    () => `platform-autosuggest-${Math.random().toString(36).slice(2)}`,
    []
  );

  const { inputRef: urlInputRef, focusInput } =
    useInputFocusController<HTMLInputElement>();

  const onPreviewChangeRef = useRef<
    ((link: DetectedLink | null, isDuplicate: boolean) => void) | undefined
  >(onPreviewChange);

  useEffect(() => {
    onPreviewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);

  const detectedLink = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (isUnsafeUrl(trimmed)) return null;
    return detectPlatform(trimmed, creatorName);
  }, [creatorName, url]);

  const isPlatformDuplicate = detectedLink
    ? existingPlatforms.includes(detectedLink.platform.id)
    : false;

  const platformSuggestions = useMemo((): RankedPlatformOption[] => {
    const trimmed = url.trim();
    if (!trimmed) return [];
    if (looksLikeUrlOrDomain(trimmed)) return [];
    if (detectedLink?.isValid) return [];
    return rankPlatformOptions(trimmed, PLATFORM_OPTIONS, existingPlatforms);
  }, [detectedLink?.isValid, existingPlatforms, url]);

  const isShortQuery = useMemo(() => {
    const trimmed = normalizeQuery(url);
    return trimmed.length > 0 && trimmed.length < 2;
  }, [url]);

  const shouldShowAutosuggest =
    autosuggestOpen && platformSuggestions.length > 0;

  useEffect(() => {
    if (!autosuggestOpen) return;
    setActiveSuggestionIndex(prev => {
      if (platformSuggestions.length === 0) return 0;
      return Math.min(Math.max(prev, 0), platformSuggestions.length - 1);
    });
  }, [autosuggestOpen, platformSuggestions.length]);

  const syncPreview = useCallback(() => {
    const callback = onPreviewChangeRef.current;
    if (!callback) return;
    if (!detectedLink?.isValid) {
      callback(null, false);
      return;
    }
    callback(detectedLink, isPlatformDuplicate);
  }, [detectedLink, isPlatformDuplicate]);

  useEffect(() => {
    syncPreview();
  }, [syncPreview]);

  useEffect(() => {
    if (!clearSignal) return;
    setUrl('');
    setSearchMode(null);
    setAutosuggestOpen(false);
    setActiveSuggestionIndex(0);
    onQueryChange?.('');
    focusInput('start');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  const handleUrlChange = useCallback(
    (value: string) => {
      setUrl(value);
      onQueryChange?.(value);

      const trimmed = value.trim();
      const nextOpen =
        trimmed.length > 0 &&
        !looksLikeUrlOrDomain(trimmed) &&
        searchMode == null;
      setAutosuggestOpen(nextOpen);
    },
    [onQueryChange, searchMode]
  );

  const handleAdd = useCallback(() => {
    if (!detectedLink?.isValid) return;

    const linkToAdd = { ...detectedLink };
    onAdd(linkToAdd);

    setUrl('');
    onQueryChange?.('');
    focusInput('start');
  }, [detectedLink, focusInput, onAdd, onQueryChange]);

  const handleClear = useCallback(() => {
    setUrl('');
    onQueryChange?.('');
    setAutosuggestOpen(false);
    setActiveSuggestionIndex(0);
    focusInput('start');
  }, [focusInput, onQueryChange]);

  const commitPlatformSelection = useCallback(
    (platform: PlatformOption) => {
      let handle = '';
      try {
        if (url.trim()) {
          const parsed = new URL(
            url.startsWith('http') ? url : `https://${url}`
          );
          const pathParts = parsed.pathname.split('/').filter(Boolean);
          if (pathParts.length > 0) {
            handle = pathParts[pathParts.length - 1] ?? '';
          }
        }
      } catch {
        const cleaned = url.trim().replace(/^@/, '');
        const lastSlash = cleaned.lastIndexOf('/');
        if (lastSlash !== -1 && lastSlash < cleaned.length - 1) {
          handle = cleaned.slice(lastSlash + 1);
        } else {
          handle = cleaned.includes(' ') ? '' : cleaned;
        }
      }

      const nextUrl = platform.prefill + handle;
      setUrl(nextUrl);
      onQueryChange?.(nextUrl);
      setAutosuggestOpen(false);
      setActiveSuggestionIndex(0);
      focusInput('end');
    },
    [focusInput, onQueryChange, url]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (shouldShowAutosuggest) {
        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault();
            setActiveSuggestionIndex(prev =>
              prev < platformSuggestions.length - 1 ? prev + 1 : 0
            );
            return;
          }
          case 'ArrowUp': {
            e.preventDefault();
            setActiveSuggestionIndex(prev =>
              prev > 0 ? prev - 1 : platformSuggestions.length - 1
            );
            return;
          }
          case 'Enter': {
            const selected = platformSuggestions[activeSuggestionIndex];
            if (!selected) return;
            e.preventDefault();
            commitPlatformSelection(selected);
            return;
          }
          case 'Escape': {
            e.preventDefault();
            setAutosuggestOpen(false);
            setActiveSuggestionIndex(0);
            return;
          }
          case 'Tab': {
            setAutosuggestOpen(false);
            setActiveSuggestionIndex(0);
            return;
          }
        }
      }

      if (e.key === 'Enter' && detectedLink?.isValid) {
        e.preventDefault();
        handleAdd();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    },
    [
      activeSuggestionIndex,
      commitPlatformSelection,
      detectedLink?.isValid,
      handleAdd,
      handleClear,
      platformSuggestions,
      shouldShowAutosuggest,
    ]
  );

  const handleArtistSearchSelect = useCallback(
    (provider: ArtistSearchProvider) => {
      track('spotify_artist_search_start', { provider });
      setSearchMode(provider);
      setUrl('');
      onQueryChange?.('');
      focusInput('start');
    },
    [focusInput, onQueryChange]
  );

  const handleExitSearchMode = useCallback(
    (nextUrl = '') => {
      setSearchMode(null);
      setUrl(nextUrl);
      onQueryChange?.(nextUrl);
      focusInput('end');
    },
    [focusInput, onQueryChange]
  );

  const handleArtistLinkSelect = useCallback(
    (link: DetectedLink) => {
      onAdd(link);
      handleExitSearchMode('https://open.spotify.com/artist/');
    },
    [handleExitSearchMode, onAdd]
  );

  useEffect(() => {
    if (!prefillUrl || url || searchMode) return;

    if (prefillUrl.startsWith('__SEARCH_MODE__:')) {
      const provider = prefillUrl.split(':')[1] as ArtistSearchProvider;
      if (provider === 'spotify') {
        setSearchMode(provider);
        setUrl('');
        onPrefillConsumed?.();
        onQueryChange?.('');
        focusInput('start');
        return;
      }
    }

    setUrl(prefillUrl);
    onPrefillConsumed?.();
    onQueryChange?.(prefillUrl);
    focusInput('end');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillUrl]);

  return {
    url,
    searchMode,
    autosuggestOpen,
    activeSuggestionIndex,
    autosuggestListId,
    urlInputRef,
    detectedLink,
    isPlatformDuplicate,
    platformSuggestions,
    shouldShowAutosuggest,
    isShortQuery,
    focusInput,
    handleUrlChange,
    handleAdd,
    handleClear,
    handleKeyDown,
    handleArtistSearchSelect,
    handleExitSearchMode,
    handleArtistLinkSelect,
    setAutosuggestOpen,
    setActiveSuggestionIndex,
    commitPlatformSelection,
  };
}
