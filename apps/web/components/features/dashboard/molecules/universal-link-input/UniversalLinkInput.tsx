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
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react';
import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';

import type { DetectedLink } from '@/lib/utils/platform-detection';

import { UniversalLinkInputArtistSearchMode } from '../artist-search-mode';
import { UniversalLinkInputUrlMode } from '../UniversalLinkInputUrlMode';
import { MultiLinkPasteDialog } from './MultiLinkPasteDialog';
import { PlatformSuggestionDropdown } from './PlatformSuggestionList';
import type { UniversalLinkInputProps } from './types';
import { useMultiLinkPaste } from './useMultiLinkPaste';
import { useUniversalLinkInput } from './useUniversalLinkInput';
import { useVoiceDictation } from './useVoiceDictation';
import { groupByCategory, looksLikeUrlOrDomain } from './utils';

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
      voiceInputEnabled = false,
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
      inputMode,
      focusInput,
      handleUrlChange,
      handleKeyDown,
      handleAdd,
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

    const {
      dictationState,
      recordingDurationLabel,
      waveformLevels,
      handleVoiceInput,
      handleCancelVoiceRecording,
      handleSendVoiceRecording,
      handleDismissPermissionError,
    } = useVoiceDictation({ voiceInputEnabled, onChatSubmit });

    const canSubmit = useMemo(() => {
      const trimmed = url.trim();
      if (!trimmed) return false;
      if (inputMode === 'chat') return true;
      return !!detectedLink?.isValid;
    }, [detectedLink?.isValid, inputMode, url]);

    const handleSubmit = useCallback(() => {
      const trimmed = url.trim();
      if (!trimmed) return;

      if (inputMode === 'chat' && onChatSubmit) {
        onChatSubmit(trimmed);
        handleClear();
        return;
      }

      if (detectedLink?.isValid) {
        handleAdd();
      }
    }, [
      detectedLink?.isValid,
      handleAdd,
      handleClear,
      inputMode,
      onChatSubmit,
      url,
    ]);

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
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
          voiceInputEnabled={voiceInputEnabled}
          onVoiceInput={handleVoiceInput}
          dictationState={dictationState}
          recordingDurationLabel={recordingDurationLabel}
          waveformLevels={waveformLevels}
          onCancelVoiceRecording={handleCancelVoiceRecording}
          onSendVoiceRecording={handleSendVoiceRecording}
          onDismissPermissionError={handleDismissPermissionError}
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
          <PlatformSuggestionDropdown
            listId={autosuggestListId}
            floatingRef={refs.setFloating}
            floatingStyles={floatingStyles}
            platformSuggestions={platformSuggestions}
            groupedSuggestions={groupedSuggestions}
            flatSuggestions={flatSuggestions}
            suggestionIndexById={suggestionIndexById}
            activeIndex={activeSuggestionIndex}
            onActiveIndexChange={setActiveSuggestionIndex}
            onSelect={commitPlatformSelection}
          />
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
