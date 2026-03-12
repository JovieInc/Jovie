'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Textarea,
} from '@jovie/ui';
import { Check, ChevronDown, Copy, Loader2, Sparkles } from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DrawerSection } from '@/components/molecules/drawer';
import { LYRICS_FORMAT_LABELS, type LyricsFormat } from '@/lib/lyrics/types';

/** Auto-save debounce delay in milliseconds */
const AUTO_SAVE_DELAY_MS = 1500;

/** All available format options in display order */
const FORMAT_OPTIONS: LyricsFormat[] = ['apple-music', 'deezer', 'genius'];

type SaveStatus = 'idle' | 'saving' | 'saved';

interface ReleaseLyricsSectionProps {
  readonly releaseId: string;
  readonly lyrics?: string;
  readonly isEditable: boolean;
  readonly isSaving?: boolean;
  readonly onSaveLyrics?: (releaseId: string, lyrics: string) => Promise<void>;
  readonly onFormatLyrics?: (
    releaseId: string,
    lyrics: string,
    format: LyricsFormat
  ) => Promise<string[]>;
}

export function ReleaseLyricsSection({
  releaseId,
  lyrics,
  isEditable,
  isSaving = false,
  onSaveLyrics,
  onFormatLyrics,
}: ReleaseLyricsSectionProps) {
  const [draftLyrics, setDraftLyrics] = useState(lyrics ?? '');
  const [isCopying, setIsCopying] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [selectedFormat, setSelectedFormat] =
    useState<LyricsFormat>('apple-music');

  // Refs for auto-save to avoid stale closures
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedIndicatorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const draftRef = useRef(draftLyrics);
  const releaseIdRef = useRef(releaseId);
  const lyricsRef = useRef(lyrics);

  // Keep refs in sync
  draftRef.current = draftLyrics;
  releaseIdRef.current = releaseId;
  lyricsRef.current = lyrics;

  // Sync draft when lyrics or releaseId changes externally
  useEffect(() => {
    setDraftLyrics(lyrics ?? '');
    setSaveStatus('idle');
  }, [lyrics, releaseId]);

  // Auto-save implementation
  const performAutoSave = useCallback(async () => {
    if (!onSaveLyrics) return;
    const currentDraft = draftRef.current;
    const currentLyrics = lyricsRef.current ?? '';
    const currentReleaseId = releaseIdRef.current;

    // Only save if there are actual changes
    if (currentDraft === currentLyrics) return;

    setSaveStatus('saving');
    try {
      await onSaveLyrics(currentReleaseId, currentDraft);
      setSaveStatus('saved');

      // Clear "Saved" indicator after 2s
      if (savedIndicatorTimerRef.current) {
        clearTimeout(savedIndicatorTimerRef.current);
      }
      savedIndicatorTimerRef.current = setTimeout(
        () => setSaveStatus('idle'),
        2000
      );
    } catch {
      setSaveStatus('idle');
      toast.error('Failed to auto-save lyrics');
    }
  }, [onSaveLyrics]);

  // Debounced auto-save on draft changes
  useEffect(() => {
    const currentLyrics = lyrics ?? '';
    if (!isEditable || !onSaveLyrics || draftLyrics === currentLyrics) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      startTransition(() => {
        performAutoSave();
      });
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [draftLyrics, lyrics, isEditable, onSaveLyrics, performAutoSave]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      if (savedIndicatorTimerRef.current)
        clearTimeout(savedIndicatorTimerRef.current);
    };
  }, []);

  const handleFormat = useCallback(
    async (format: LyricsFormat) => {
      if (!onFormatLyrics || !draftLyrics.trim()) return;
      setSelectedFormat(format);
      setIsFormatting(true);
      try {
        const changes = await onFormatLyrics(releaseId, draftLyrics, format);
        if (changes.length > 0) {
          toast.info(changes.join(' · '));
        }
      } catch {
        toast.error('Unable to format lyrics right now');
      } finally {
        setIsFormatting(false);
      }
    },
    [onFormatLyrics, releaseId, draftLyrics]
  );

  const handleCopy = useCallback(async () => {
    if (!draftLyrics.trim()) {
      toast.info('Add lyrics before copying');
      return;
    }
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(draftLyrics);
      toast.success('Lyrics copied');
    } catch {
      toast.error('Unable to copy lyrics');
    } finally {
      setIsCopying(false);
    }
  }, [draftLyrics]);

  const isActionsDisabled = !draftLyrics.trim() || isSaving;
  const showFormatOptions = isEditable && onFormatLyrics;

  return (
    <DrawerSection title='Lyrics'>
      <div className='space-y-2'>
        <Textarea
          placeholder='Paste your lyrics here'
          value={draftLyrics}
          onChange={event => setDraftLyrics(event.target.value)}
          rows={draftLyrics ? 10 : 4}
          disabled={!isEditable || isSaving}
          className='resize-y'
        />
        {/* Auto-save status indicator */}
        {saveStatus !== 'idle' && (
          <div className='flex items-center gap-1 text-2xs text-(--linear-text-tertiary)'>
            {saveStatus === 'saving' && (
              <>
                <Loader2 className='h-3 w-3 animate-spin' aria-hidden='true' />
                <span>Saving…</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className='h-3 w-3 text-success' aria-hidden='true' />
                <span>Saved</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className='mt-3 flex items-center gap-2'>
        {/* Copy button */}
        <Button
          type='button'
          size='sm'
          variant='secondary'
          disabled={isActionsDisabled || isCopying}
          onClick={handleCopy}
        >
          {isCopying ? (
            <Check className='h-3.5 w-3.5 text-success' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
          {isCopying ? 'Copied!' : 'Copy'}
        </Button>

        {/* Format split button: primary action + dropdown chevron */}
        {showFormatOptions && (
          <div className='inline-flex items-center rounded-[8px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) shadow-none'>
            {/* Primary format action — uses the most recently selected format */}
            <Button
              type='button'
              size='sm'
              variant='secondary'
              disabled={isActionsDisabled || isFormatting}
              onClick={() => handleFormat(selectedFormat)}
              className='rounded-r-none border-r border-r-(--linear-border-subtle)'
            >
              {isFormatting ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Sparkles className='h-3.5 w-3.5' />
              )}
              {isFormatting
                ? 'Formatting…'
                : `Format: ${LYRICS_FORMAT_LABELS[selectedFormat]}`}
            </Button>

            {/* Dropdown chevron — shows all format options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  disabled={isActionsDisabled || isFormatting}
                  className='rounded-l-none px-1.5'
                  aria-label='Choose format'
                >
                  <ChevronDown className='h-3.5 w-3.5' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {FORMAT_OPTIONS.map(format => (
                  <DropdownMenuItem
                    key={format}
                    onClick={() => handleFormat(format)}
                    disabled={isFormatting}
                  >
                    <Sparkles className='h-3.5 w-3.5' />
                    {LYRICS_FORMAT_LABELS[format]}
                    {format === selectedFormat && (
                      <Check className='ml-auto h-3.5 w-3.5 text-success' />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className='px-2 py-1.5 text-2xs text-(--linear-text-tertiary)'>
                  Formats lyrics for the selected platform
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </DrawerSection>
  );
}
