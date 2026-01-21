'use client';

/**
 * UniversalLinkInput Component
 *
 * A smart link input that detects platforms, suggests completions,
 * and supports artist search mode for Spotify.
 */

import { forwardRef, useImperativeHandle } from 'react';

import { cn } from '@/lib/utils';

import { UniversalLinkInputArtistSearchMode } from '../artist-search-mode';
import { UniversalLinkInputUrlMode } from '../UniversalLinkInputUrlMode';
import type { UniversalLinkInputProps } from './types';
import { useUniversalLinkInput } from './useUniversalLinkInput';
import { looksLikeUrlOrDomain } from './utils';

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
    const {
      url,
      searchMode,
      activeSuggestionIndex,
      autosuggestListId,
      urlInputRef,
      detectedLink,
      platformSuggestions,
      shouldShowAutosuggest,
      focusInput,
      handleUrlChange,
      handleKeyDown,
      handleClear,
      handlePlatformSelect,
      handleArtistSearchSelect,
      handleExitSearchMode,
      handleArtistLinkSelect,
      setAutosuggestOpen,
      setActiveSuggestionIndex,
      commitPlatformSelection,
    } = useUniversalLinkInput({
      onAdd,
      existingPlatforms,
      creatorName,
      onQueryChange,
      onPreviewChange,
      prefillUrl,
      onPrefillConsumed,
      clearSignal,
    });

    useImperativeHandle(forwardedRef, () => ({
      getInputElement: () => urlInputRef.current,
    }));

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
          isDropdownOpen={shouldShowAutosuggest}
          onFocus={() => {
            const trimmed = url.trim();
            const nextOpen =
              trimmed.length > 0 &&
              !looksLikeUrlOrDomain(trimmed) &&
              !detectedLink?.isValid;
            setAutosuggestOpen(nextOpen);
          }}
          onBlur={() => {
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
            tabIndex={-1}
            className='absolute left-0 right-0 top-full z-50 overflow-hidden rounded-b-3xl border-x-2 border-b-2 border-accent bg-surface-1 shadow-lg'
            onMouseDown={event => {
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
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-primary-token transition',
                    active ? 'bg-surface-2' : 'hover:bg-surface-2'
                  )}
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
