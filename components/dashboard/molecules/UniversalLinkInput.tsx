'use client';

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

import { track } from '@/lib/analytics';
import {
  type DetectedLink,
  detectPlatform,
} from '@/lib/utils/platform-detection';

import { UniversalLinkInputArtistSearchMode } from './UniversalLinkInputArtistSearchMode';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';
import {
  type ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from './universalLinkInput.constants';
import { useInputFocusController } from './useInputFocusController';

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
    const [url, setUrl] = useState('');
    const [searchMode, setSearchMode] = useState<ArtistSearchProvider | null>(
      null
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
    }, [creatorName, url]);

    const isPlatformDuplicate = detectedLink
      ? existingPlatforms.includes(detectedLink.platform.id)
      : false;

    const syncPreview = useCallback(() => {
      const callback = onPreviewChangeRef.current;
      if (!callback) return;
      if (!detectedLink || !detectedLink.isValid) {
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
      onQueryChange?.('');
      focusInput('start');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clearSignal]);

    useImperativeHandle(forwardedRef, () => ({
      getInputElement: () => urlInputRef.current,
    }));

    const handleUrlChange = useCallback(
      (value: string) => {
        setUrl(value);
        onQueryChange?.(value);
      },
      [onQueryChange]
    );

    const handleAdd = useCallback(() => {
      if (!detectedLink || !detectedLink.isValid) return;

      const linkToAdd = { ...detectedLink };
      onAdd(linkToAdd);

      setUrl('');
      onQueryChange?.('');
      focusInput('start');
    }, [detectedLink, focusInput, onAdd, onQueryChange]);

    const handleClear = useCallback(() => {
      setUrl('');
      onQueryChange?.('');
      focusInput('start');
    }, [focusInput, onQueryChange]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && detectedLink?.isValid) {
          e.preventDefault();
          handleAdd();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleClear();
        }
      },
      [detectedLink?.isValid, handleAdd, handleClear]
    );

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
        focusInput('end');
      },
      [focusInput, onQueryChange, url]
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

    return searchMode ? (
      <UniversalLinkInputArtistSearchMode
        provider={searchMode}
        creatorName={creatorName}
        disabled={disabled}
        onSelect={handleArtistLinkSelect}
        onExit={handleExitSearchMode}
        onQueryChange={onQueryChange}
        inputRef={urlInputRef}
        focusInput={focusInput}
      />
    ) : (
      <div className='relative w-full'>
        <UniversalLinkInputUrlMode
          url={url}
          placeholder={placeholder}
          disabled={disabled}
          detectedLink={detectedLink}
          inputRef={urlInputRef}
          onUrlChange={handleUrlChange}
          onKeyDown={handleKeyDown}
          onClear={handleClear}
          onPlatformSelect={handlePlatformSelect}
          onArtistSearchSelect={handleArtistSearchSelect}
          onRestoreFocus={focusInput}
        />
      </div>
    );
  }
);

UniversalLinkInput.displayName = 'UniversalLinkInput';
