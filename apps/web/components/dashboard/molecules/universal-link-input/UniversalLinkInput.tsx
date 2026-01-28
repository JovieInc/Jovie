'use client';

/**
 * UniversalLinkInput Component
 *
 * A smart link input that detects platforms, suggests completions,
 * and supports artist search mode for Spotify.
 */

import {
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react';
import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';

import { getPlatformIcon, SocialIcon } from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { isBrandDark } from '@/lib/utils/color';
import type { DetectedLink } from '@/lib/utils/platform-detection';

import { UniversalLinkInputArtistSearchMode } from '../artist-search-mode';
import { UniversalLinkInputUrlMode } from '../UniversalLinkInputUrlMode';
import { MultiLinkPasteDialog } from './MultiLinkPasteDialog';
import type { UniversalLinkInputProps } from './types';
import { useMultiLinkPaste } from './useMultiLinkPaste';
import { useUniversalLinkInput } from './useUniversalLinkInput';
import {
  groupByCategory,
  looksLikeUrlOrDomain,
  type RankedPlatformOption,
} from './utils';

export interface UniversalLinkInputRef {
  getInputElement: () => HTMLInputElement | null;
}

/**
 * Renders a platform name with matched characters highlighted.
 */
function HighlightedName({
  name,
  matchIndices,
}: {
  name: string;
  matchIndices: number[];
}) {
  if (matchIndices.length === 0) {
    return <span className='font-medium'>{name}</span>;
  }

  const matchSet = new Set(matchIndices);
  const charCounts = new Map<string, number>();
  let charIndex = 0;

  return (
    <span className='font-medium'>
      {name.split('').map(char => {
        const currentIndex = charIndex;
        charIndex += 1;
        const count = charCounts.get(char) ?? 0;
        charCounts.set(char, count + 1);

        return (
          <span
            key={`${char}-${count}`}
            className={matchSet.has(currentIndex) ? 'text-accent' : undefined}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

/**
 * A single platform suggestion item with icon, highlighted name, and hint.
 */
function PlatformSuggestionItem({
  option,
  active,
  optionId,
  onMouseEnter,
  onClick,
}: {
  option: RankedPlatformOption;
  active: boolean;
  optionId: string;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const iconMeta = getPlatformIcon(option.icon);
  const iconHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';
  const isDark = isBrandDark(iconHex);

  return (
    // NOSONAR S6819: Custom option with icon and rich content; native <option> can't render this
    <button
      id={optionId}
      role='option'
      aria-selected={active}
      type='button'
      className={cn(
        'flex w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left text-sm text-primary-token transition',
        active ? 'bg-surface-2' : 'hover:bg-surface-2'
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className='flex items-center gap-2.5'>
        {/* Platform icon */}
        <span
          className='flex h-6 w-6 shrink-0 items-center justify-center rounded-md'
          style={{
            backgroundColor: iconHex,
            color: isDark ? '#ffffff' : '#0f172a',
          }}
        >
          <SocialIcon platform={option.icon} className='h-3.5 w-3.5' />
        </span>
        {/* Platform name with match highlighting */}
        <HighlightedName
          name={option.name}
          matchIndices={option.matchIndices}
        />
        {/* Simplified hint */}
        <span className='text-xs text-tertiary-token'>{option.hint}</span>
      </span>
      {/* Only show Enter hint on active item */}
      {active && <span className='text-xs text-tertiary-token'>Enter</span>}
    </button>
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
    const {
      url,
      searchMode,
      activeSuggestionIndex,
      autosuggestListId,
      urlInputRef,
      detectedLink,
      platformSuggestions,
      shouldShowAutosuggest,
      isShortQuery,
      focusInput,
      handleUrlChange,
      handleKeyDown,
      handleClear,
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

    // Batch add handler for multi-link paste
    const handleBatchAdd = useCallback(
      (links: DetectedLink[]) => {
        for (const link of links) {
          onAdd(link);
        }
      },
      [onAdd]
    );

    const {
      multiLinkState,
      handlePaste,
      handleDialogClose,
      handleConfirmAdd,
      toggleLinkSelection,
      selectableCount,
    } = useMultiLinkPaste({
      existingPlatforms,
      creatorName,
      onBatchAdd: handleBatchAdd,
    });

    useImperativeHandle(forwardedRef, () => ({
      getInputElement: () => urlInputRef.current,
    }));

    // Group platforms by category when showing popular platforms (short query)
    const groupedSuggestions = useMemo(() => {
      if (!isShortQuery) return null;
      return groupByCategory(platformSuggestions);
    }, [isShortQuery, platformSuggestions]);

    // Calculate global index for keyboard navigation across groups
    const flatSuggestions = useMemo(() => {
      if (!groupedSuggestions) return platformSuggestions;
      return groupedSuggestions.flatMap(group => group.options);
    }, [groupedSuggestions, platformSuggestions]);

    // FloatingPortal for auto-suggest dropdown to escape overflow containers
    const { refs, floatingStyles } = useFloating({
      open: shouldShowAutosuggest,
      placement: 'bottom-start',
      middleware: [offset(0), flip(), shift({ padding: 8 })],
      whileElementsMounted: autoUpdate,
    });

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
      <div ref={refs.setReference} className='relative w-full'>
        <UniversalLinkInputUrlMode
          url={url}
          placeholder={placeholder}
          disabled={disabled}
          detectedLink={detectedLink}
          inputRef={urlInputRef}
          onUrlChange={handleUrlChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onClear={handleClear}
          onPlatformSelect={commitPlatformSelection}
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
            setTimeout(() => {
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
          // NOSONAR S6819: Custom autocomplete requires ARIA listbox pattern; native <select> can't support search or custom styling
          <FloatingPortal>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              id={autosuggestListId}
              role='listbox'
              aria-label='Platform suggestions'
              tabIndex={-1}
              className='z-100 overflow-hidden rounded-b-3xl border-2 border-t-0 border-accent bg-surface-1 py-1 shadow-lg'
              onMouseDown={event => {
                event.preventDefault();
              }}
            >
              {groupedSuggestions
                ? // Grouped view for short queries (popular platforms by category)
                  groupedSuggestions.map((group, groupIndex) => {
                    const groupStartIndex = flatSuggestions.findIndex(
                      opt => opt.id === group.options[0]?.id
                    );
                    return (
                      <div key={group.category}>
                        {/* Divider between categories (not before first) */}
                        {groupIndex > 0 && (
                          <div className='mx-3 my-1 border-t border-default' />
                        )}
                        <div className='px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-tertiary-token'>
                          {group.label}
                        </div>
                        {group.options.map((option, indexInGroup) => {
                          const globalIndex = groupStartIndex + indexInGroup;
                          const active = globalIndex === activeSuggestionIndex;
                          return (
                            <PlatformSuggestionItem
                              key={option.id}
                              option={option}
                              active={active}
                              optionId={`${autosuggestListId}-option-${globalIndex}`}
                              onMouseEnter={() =>
                                setActiveSuggestionIndex(globalIndex)
                              }
                              onClick={() => commitPlatformSelection(option)}
                            />
                          );
                        })}
                      </div>
                    );
                  })
                : // Flat view for longer queries (fuzzy matched results)
                  platformSuggestions.map((option, index) => {
                    const active = index === activeSuggestionIndex;
                    return (
                      <PlatformSuggestionItem
                        key={option.id}
                        option={option}
                        active={active}
                        optionId={`${autosuggestListId}-option-${index}`}
                        onMouseEnter={() => setActiveSuggestionIndex(index)}
                        onClick={() => commitPlatformSelection(option)}
                      />
                    );
                  })}
            </div>
          </FloatingPortal>
        ) : null}

        {/* Multi-link paste dialog */}
        <MultiLinkPasteDialog
          open={multiLinkState.isOpen}
          onClose={handleDialogClose}
          onConfirm={handleConfirmAdd}
          extractedLinks={multiLinkState.extractedLinks}
          onToggleSelection={toggleLinkSelection}
          selectableCount={selectableCount}
        />
      </div>
    );
  }
);

UniversalLinkInput.displayName = 'UniversalLinkInput';
