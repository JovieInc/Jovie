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
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';

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
    return <span className='font-caption'>{name}</span>;
  }

  const matchSet = new Set(matchIndices);
  const characters = Array.from(name).map((char, index) => ({
    id: `${name}-${index}-${char}`,
    char,
    index,
  }));

  return (
    <span className='font-caption'>
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
        'flex min-h-[44px] w-full items-center justify-between gap-2.5 px-3 py-2.5 text-left text-[13px] text-primary-token transition',
        active ? 'bg-surface-2' : 'hover:bg-surface-2',
        'active:scale-[0.99]'
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
        <span className='text-[13px] text-tertiary-token'>{option.hint}</span>
      </span>
      {/* Only show Enter hint on active item */}
      {active && (
        <span className='max-sm:hidden text-[13px] text-tertiary-token sm:inline'>
          Enter
        </span>
      )}
    </button>
  );
}

const randomWaveformLevel = () => 0.3 + Math.random() * 0.7; // NOSONAR (S2245) - Non-security use: audio waveform visual bar height randomization
const WAVEFORM_BAND_COUNT = 20;
const MIN_WAVEFORM_LEVEL = 0.08;
const PROCESSING_DELAY_MS = 900;
const DONE_DELAY_MS = 700;
const SHORTCUT_MICROPHONE_KEY = 'm';

function computeWaveformBands(data: Uint8Array): number[] {
  return Array.from({ length: WAVEFORM_BAND_COUNT }, (_, index) => {
    const start = Math.floor((index / WAVEFORM_BAND_COUNT) * data.length);
    const end = Math.floor(((index + 1) / WAVEFORM_BAND_COUNT) * data.length);
    const range = data.slice(start, Math.max(end, start + 1));
    const total = range.reduce((sum, value) => sum + value, 0);
    const average = total / range.length / 255;
    return Math.max(MIN_WAVEFORM_LEVEL, average);
  });
}

type DictationState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'done'
  | 'permission-error';

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

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
    const processingTimerRef = useRef<ReturnType<
      typeof globalThis.setTimeout
    > | null>(null);
    const doneTimerRef = useRef<ReturnType<
      typeof globalThis.setTimeout
    > | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recordingTimerRef = useRef<ReturnType<
      typeof globalThis.setInterval
    > | null>(null);
    const [dictationState, setDictationState] =
      useState<DictationState>('idle');
    const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
    const [waveformLevels, setWaveformLevels] = useState<number[]>(
      Array.from({ length: WAVEFORM_BAND_COUNT }, randomWaveformLevel)
    );

    const clearRecordingTimers = useCallback(() => {
      if (recordingTimerRef.current !== null) {
        globalThis.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (animationFrameRef.current !== null) {
        globalThis.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (processingTimerRef.current !== null) {
        globalThis.clearTimeout(processingTimerRef.current);
        processingTimerRef.current = null;
      }
      if (doneTimerRef.current !== null) {
        globalThis.clearTimeout(doneTimerRef.current);
        doneTimerRef.current = null;
      }
    }, []);

    const stopWaveformAnalyzer = useCallback(() => {
      analyserRef.current = null;
      frequencyDataRef.current = null;
      if (audioContextRef.current !== null) {
        audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
      if (animationFrameRef.current !== null) {
        globalThis.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }, []);

    const startWaveformAnalyzer = useCallback((stream: MediaStream) => {
      if (globalThis.AudioContext === undefined) {
        animationFrameRef.current = globalThis.requestAnimationFrame(() => {
          setWaveformLevels(
            Array.from({ length: WAVEFORM_BAND_COUNT }, randomWaveformLevel)
          );
        });
        return;
      }

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      frequencyDataRef.current = frequencyData;

      const animate = () => {
        const activeAnalyser = analyserRef.current;
        const activeFrequencyData = frequencyDataRef.current;
        if (!activeAnalyser || !activeFrequencyData) {
          return;
        }

        activeAnalyser.getByteFrequencyData(activeFrequencyData);
        setWaveformLevels(computeWaveformBands(activeFrequencyData));
        animationFrameRef.current = globalThis.requestAnimationFrame(animate);
      };

      animationFrameRef.current = globalThis.requestAnimationFrame(animate);
    }, []);

    const stopRecordingSession = useCallback(() => {
      clearRecordingTimers();
      stopWaveformAnalyzer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }

      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      streamRef.current = null;
      mediaRecorderRef.current = null;
    }, [clearRecordingTimers, stopWaveformAnalyzer]);

    useEffect(() => {
      return () => {
        stopRecordingSession();
      };
    }, [stopRecordingSession]);

    const handleVoiceInput = useCallback(async () => {
      if (!voiceInputEnabled) return;
      if (globalThis.window === undefined) return;
      if (!navigator.mediaDevices?.getUserMedia) return;
      if (dictationState === 'processing') return;
      if (dictationState === 'listening') {
        stopRecordingSession();
        setDictationState('idle');
        setRecordingDurationSeconds(0);
        return;
      }
      setDictationState('idle');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;

        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        recorder.addEventListener('stop', () => {
          for (const track of stream.getTracks()) {
            track.stop();
          }
          streamRef.current = null;
          mediaRecorderRef.current = null;
        });

        recorder.start();
        setRecordingDurationSeconds(0);
        setDictationState('listening');
        recordingTimerRef.current = globalThis.setInterval(() => {
          setRecordingDurationSeconds(current => current + 1);
        }, 1000);
        startWaveformAnalyzer(stream);
      } catch {
        setDictationState('permission-error');
      }
    }, [
      dictationState,
      startWaveformAnalyzer,
      stopRecordingSession,
      voiceInputEnabled,
    ]);

    const recordingDurationLabel = useMemo(() => {
      const minutes = Math.floor(recordingDurationSeconds / 60);
      const seconds = recordingDurationSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }, [recordingDurationSeconds]);

    const handleCancelVoiceRecording = useCallback(() => {
      stopRecordingSession();
      setRecordingDurationSeconds(0);
      setWaveformLevels(
        Array.from({ length: WAVEFORM_BAND_COUNT }, () => 0.12)
      );
      setDictationState('idle');
    }, [stopRecordingSession]);

    const handleSendVoiceRecording = useCallback(() => {
      stopRecordingSession();
      const durationSnapshot = recordingDurationLabel;
      setDictationState('processing');
      processingTimerRef.current = globalThis.setTimeout(() => {
        if (onChatSubmit) {
          onChatSubmit(`[Voice message ${durationSnapshot}]`);
        }
        setDictationState('done');
        setRecordingDurationSeconds(0);
        doneTimerRef.current = globalThis.setTimeout(() => {
          setDictationState('idle');
          setWaveformLevels(
            Array.from({ length: WAVEFORM_BAND_COUNT }, randomWaveformLevel)
          );
        }, DONE_DELAY_MS);
      }, PROCESSING_DELAY_MS);
    }, [onChatSubmit, recordingDurationLabel, stopRecordingSession]);

    const handleDismissPermissionError = useCallback(() => {
      setDictationState('idle');
    }, []);

    useEffect(() => {
      if (!voiceInputEnabled) return;

      const onKeyDown = (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
        if (event.key.toLowerCase() !== SHORTCUT_MICROPHONE_KEY) return;
        event.preventDefault();
        handleVoiceInput().catch(() => {});
      };

      globalThis.window.addEventListener('keydown', onKeyDown);
      return () => {
        globalThis.window.removeEventListener('keydown', onKeyDown);
      };
    }, [handleVoiceInput, voiceInputEnabled]);

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
                className='z-100 overflow-hidden rounded-b-3xl border-2 border-t-0 border-accent bg-surface-1 py-1 shadow-popover'
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
                          <div className='px-3 pb-1 pt-2 text-[13px] font-caption tracking-normal text-secondary-token'>
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
