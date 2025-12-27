'use client';

import type React from 'react';
import {
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
  validateLink,
} from '@/lib/utils/platform-detection';

import { UniversalLinkInputArtistSearchMode } from './UniversalLinkInputArtistSearchMode';
import { UniversalLinkInputUrlMode } from './UniversalLinkInputUrlMode';
import {
  type ArtistSearchProvider,
  PLATFORM_OPTIONS,
} from './universalLinkInput.constants';
import { useInputFocusController } from './useInputFocusController';

type PlatformOption = (typeof PLATFORM_OPTIONS)[number];

function normalizeQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function looksLikeUrlOrDomain(value: string): boolean {
  const v = normalizeQuery(value);
  if (!v) return false;
  if (v.startsWith('http://') || v.startsWith('https://')) return true;
  if (v.includes('/') || v.includes('?') || v.includes('#')) return true;
  // "x.com", "instagram.com/tim" should be treated as URL intent.
  if (v.includes('.')) return true;
  return false;
}

function fuzzyScore(queryRaw: string, targetRaw: string): number | null {
  const query = normalizeQuery(queryRaw);
  const target = normalizeQuery(targetRaw);
  if (!query) return null;

  let score = 0;
  let lastMatchIdx = -1;
  let tIdx = 0;

  for (let qIdx = 0; qIdx < query.length; qIdx += 1) {
    const qChar = query[qIdx];
    if (qChar === ' ') continue;

    let found = false;
    while (tIdx < target.length) {
      if (target[tIdx] === qChar) {
        found = true;
        const consecutive = lastMatchIdx === tIdx - 1;
        score += consecutive ? 3 : 1;
        lastMatchIdx = tIdx;
        tIdx += 1;
        break;
      }
      tIdx += 1;
    }
    if (!found) return null;
  }

  if (target.startsWith(query)) score += 6;
  // Prefer shorter targets (e.g., "x" vs "twitter") when same match strength.
  score -= Math.min(target.length, 40) * 0.05;
  return score;
}

function rankPlatformOptions(
  query: string,
  options: readonly PlatformOption[],
  existingPlatforms: readonly string[]
): PlatformOption[] {
  const existing = new Set(existingPlatforms);
  const scored = options
    .filter(option => {
      // Allow YouTube selection even if present (it can live in multiple sections).
      if (option.id === 'youtube') return true;
      return !existing.has(option.id);
    })
    .map(option => {
      const byName = fuzzyScore(query, option.name);
      const byId = fuzzyScore(query, option.id.replace(/-/g, ' '));
      const best = Math.max(byName ?? -Infinity, byId ?? -Infinity);
      return { option, score: Number.isFinite(best) ? best : null };
    })
    .filter(
      (entry): entry is { option: PlatformOption; score: number } =>
        typeof entry.score === 'number'
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(entry => entry.option);

  return scored;
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
      return validateLink(trimmed);
    }, [url]);

    const isPlatformDuplicate = detectedLink
      ? existingPlatforms.includes(detectedLink.platform.id)
      : false;

    const platformSuggestions = useMemo(() => {
      const trimmed = url.trim();
      if (!trimmed) return [] as PlatformOption[];
      if (looksLikeUrlOrDomain(trimmed)) return [] as PlatformOption[];
      // If detection already looks like a valid URL, we treat it as URL intent.
      if (detectedLink?.isValid) return [] as PlatformOption[];
      return rankPlatformOptions(trimmed, PLATFORM_OPTIONS, existingPlatforms);
    }, [detectedLink?.isValid, existingPlatforms, url]);

    const shouldShowAutosuggest =
      autosuggestOpen && platformSuggestions.length > 0;

    useEffect(() => {
      if (!autosuggestOpen) return;
      // Keep active index in range as the list changes.
      setActiveSuggestionIndex(prev => {
        if (platformSuggestions.length === 0) return 0;
        return Math.min(Math.max(prev, 0), platformSuggestions.length - 1);
      });
    }, [autosuggestOpen, platformSuggestions.length]);

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
      setAutosuggestOpen(false);
      setActiveSuggestionIndex(0);
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
      setAutosuggestOpen(false);
      setActiveSuggestionIndex(0);
      focusInput('start');
    }, [focusInput, onQueryChange]);

    const commitPlatformSelection = useCallback(
      (platform: PlatformOption) => {
        // Reuse existing behavior: extract a handle-ish suffix from current input.
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
            // If the user typed "insta" or "tiktok tim", do not try to be clever.
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

    const handlePlatformSelect = useCallback(
      (platform: (typeof PLATFORM_OPTIONS)[number]) => {
        commitPlatformSelection(platform);
      },
      [commitPlatformSelection]
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
          onFocus={() => {
            const trimmed = url.trim();
            const nextOpen =
              trimmed.length > 0 &&
              !looksLikeUrlOrDomain(trimmed) &&
              !detectedLink?.isValid;
            setAutosuggestOpen(nextOpen);
          }}
          onBlur={() => {
            // Defer close to allow suggestion click to register.
            window.setTimeout(() => {
              setAutosuggestOpen(false);
              setActiveSuggestionIndex(0);
            }, 0);
          }}
          comboboxAria={
            shouldShowAutosuggest
              ? {
                  role: 'combobox',
                  ariaExpanded: true,
                  ariaControls: autosuggestListId,
                  ariaActivedescendant: `${autosuggestListId}-option-${activeSuggestionIndex}`,
                  ariaAutocomplete: 'list',
                }
              : undefined
          }
        />

        {shouldShowAutosuggest ? (
          <div
            id={autosuggestListId}
            role='listbox'
            aria-label='Platform suggestions'
            className='absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-lg'
            onMouseDown={event => {
              // Keep input focused while selecting.
              event.preventDefault();
            }}
          >
            {platformSuggestions.map((option, index) => {
              const active = index === activeSuggestionIndex;
              return (
                <button
                  key={option.id}
                  id={`${autosuggestListId}-option-${index}`}
                  role='option'
                  aria-selected={active}
                  type='button'
                  className={
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ' +
                    (active
                      ? 'bg-surface-2 text-primary-token'
                      : 'text-primary-token hover:bg-surface-2')
                  }
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => commitPlatformSelection(option)}
                >
                  <span className='flex items-center gap-2'>
                    <span className='font-medium'>{option.name}</span>
                    <span className='text-xs text-tertiary-token'>
                      {option.prefill}
                    </span>
                  </span>
                  <span className='text-xs text-tertiary-token'>Enter</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }
);

UniversalLinkInput.displayName = 'UniversalLinkInput';
