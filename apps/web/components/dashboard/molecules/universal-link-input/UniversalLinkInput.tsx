'use client';

/* eslint-disable react-hooks/refs -- refs.setReference and refs.setFloating from useFloating are callback refs, not ref value accesses */

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

import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { cn } from '@/lib/utils';
import { getContrastTextOnBrand } from '@/lib/utils/color';
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
  readonly name: string;
  readonly matchIndices: number[];
}) {
  if (matchIndices.length === 0) {
    return <span className='font-medium'>{name}</span>;
  }

  const matchSet = new Set(matchIndices);
  const characters = Array.from(name).map((char, index) => ({
    id: `${name}-${index}-${char}`,
    char,
    index,
  }));

  return (
    <span className='font-medium'>
      {characters.map(character => (
        <span
          key={character.id}
          className={matchSet.has(character.index) ? 'text-accent' : undefined}
        >
          {character.char}
        </span>
      ))}
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
  readonly option: RankedPlatformOption;
  readonly active: boolean;
  readonly optionId: string;
  readonly onMouseEnter: () => void;
  readonly onClick: () => void;
}) {
  const iconMeta = getPlatformIconMetadata(option.icon);
  const iconHex = iconMeta?.hex ? `#${iconMeta.hex}` : '#6b7280';

  return (
    <button
      data-option-id={optionId}
      type='button'
      className={cn(
        'flex w-full min-h-[44px] items-center justify-between gap-2.5 px-3 py-2.5 text-left text-sm text-primary-token transition',
        active ? 'bg-surface-2' : 'hover:bg-surface-2',
        'active:opacity-90'
      )}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className='flex items-center gap-2.5'>
        {/* Platform icon - larger on mobile */}
        <span
          className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-6 sm:w-6 sm:rounded-md'
          style={{
            backgroundColor: iconHex,
            color: getContrastTextOnBrand(iconHex),
          }}
        >
          <SocialIcon
            platform={option.icon}
            className='h-4 w-4 sm:h-3.5 sm:w-3.5'
          />
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
      {active && (
        <span className='hidden text-xs text-tertiary-token sm:inline'>
          Enter
        </span>
      )}
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
      placeholder = 'Paste any link or ask Jovie anything...',
      disabled = false,
      existingPlatforms = [],
      prefillUrl,
      onPrefillConsumed,
      creatorName,
      onQueryChange,
      onPreviewChange,
      clearSignal = 0,
      chatEnabled = true,
      onChatSubmit,
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
      chatEnabled,
      onChatSubmit,
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
    const suggestionIndexById = useMemo(
      () =>
        new Map(
          flatSuggestions.map((suggestion, index) => [suggestion.id, index])
        ),
      [flatSuggestions]
    );

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
          <>
            <select
              id={autosuggestListId}
              className='sr-only'
              size={Math.max(Math.min(flatSuggestions.length, 8), 1)}
              aria-label='Platform suggestions'
              value={
                activeSuggestionIndex >= 0 &&
                flatSuggestions[activeSuggestionIndex]
                  ? flatSuggestions[activeSuggestionIndex].id
                  : ''
              }
              onChange={event => {
                const selectedOption = flatSuggestions.find(
                  option => option.id === event.target.value
                );
                if (selectedOption) {
                  commitPlatformSelection(selectedOption);
                }
              }}
            >
              <option value='' disabled>
                Select a platform
              </option>
              {groupedSuggestions
                ? groupedSuggestions.map(group => (
                    <optgroup key={group.category} label={group.label}>
                      {group.options.map(option => {
                        const optionIndex =
                          suggestionIndexById.get(option.id) ?? 0;
                        return (
                          <option
                            key={option.id}
                            id={`${autosuggestListId}-option-${optionIndex}`}
                            value={option.id}
                          >
                            {option.name} — {option.hint}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))
                : platformSuggestions.map((option, index) => (
                    <option
                      key={option.id}
                      id={`${autosuggestListId}-option-${index}`}
                      value={option.id}
                    >
                      {option.name} — {option.hint}
                    </option>
                  ))}
            </select>
            <FloatingPortal>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                className='z-100 overflow-hidden rounded-b-3xl border-2 border-t-0 border-accent bg-surface-1 py-1 shadow-lg'
                onMouseDown={event => {
                  event.preventDefault();
                }}
                aria-hidden='true'
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
                            const active =
                              globalIndex === activeSuggestionIndex;
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
          </>
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
