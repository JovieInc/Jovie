'use client';

import {
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
import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { LYRICS_FORMAT_LABELS, type LyricsFormat } from '@/lib/lyrics/types';
import { cn } from '@/lib/utils';

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
  readonly variant?: 'card' | 'flat';
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
  variant = 'card',
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
    <DrawerSurfaceCard
      variant={variant}
      className={cn(
        variant === 'card' && LINEAR_SURFACE.drawerCardSm,
        'overflow-hidden'
      )}
    >
      <div className='space-y-2.5 p-3'>
        <Textarea
          placeholder='Paste your lyrics here'
          value={draftLyrics}
          onChange={event => setDraftLyrics(event.target.value)}
          rows={draftLyrics ? 10 : 4}
          disabled={!isEditable || isSaving}
          className='min-h-[140px] resize-y border-(--linear-app-frame-seam) bg-surface-0 text-[12px]'
        />
        {/* Auto-save status indicator */}
        {saveStatus !== 'idle' && (
          <div className='flex items-center gap-1 text-2xs text-tertiary-token'>
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

      <div className='flex flex-wrap items-center gap-2 border-t border-(--linear-app-frame-seam) px-3 py-2.5'>
        <DrawerButton
          type='button'
          disabled={isActionsDisabled || isCopying}
          onClick={handleCopy}
          className='h-7 px-2 text-2xs'
        >
          {isCopying ? (
            <Check className='h-3.5 w-3.5 text-success' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
          {isCopying ? 'Copied!' : 'Copy'}
        </DrawerButton>

        {showFormatOptions && (
          <div className='inline-flex items-center rounded-full border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-bg-surface-1)_82%,var(--linear-bg-surface-0))]'>
            <DrawerButton
              type='button'
              disabled={isActionsDisabled || isFormatting}
              onClick={() => handleFormat(selectedFormat)}
              className='h-7 rounded-r-none border-r border-r-(--linear-border-subtle) px-2 text-2xs'
            >
              {isFormatting ? (
                <Loader2 className='h-3.5 w-3.5 animate-spin' />
              ) : (
                <Sparkles className='h-3.5 w-3.5' />
              )}
              {isFormatting
                ? 'Formatting…'
                : `Format: ${LYRICS_FORMAT_LABELS[selectedFormat]}`}
            </DrawerButton>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DrawerButton
                  type='button'
                  size='icon'
                  disabled={isActionsDisabled || isFormatting}
                  className='h-7 w-7 rounded-l-none px-1.5'
                  aria-label='Choose format'
                >
                  <ChevronDown className='h-3.5 w-3.5' />
                </DrawerButton>
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
                <div className='px-2 py-1.5 text-2xs text-tertiary-token'>
                  Formats lyrics for the selected platform
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </DrawerSurfaceCard>
  );
}
