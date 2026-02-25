'use client';

import {
  Button,
  CommonDropdown,
  type CommonDropdownItem,
  Textarea,
} from '@jovie/ui';
import { Check, ChevronDown, Copy, Loader2, Sparkles } from 'lucide-react';
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { DrawerSection } from '@/components/molecules/drawer';

/** Auto-save debounce delay in milliseconds */
const AUTO_SAVE_DELAY_MS = 1500;

type SaveStatus = 'idle' | 'saving' | 'saved';
type LyricsFormatTarget = 'apple_music' | 'deezer' | 'genius';

const FORMAT_OPTIONS: ReadonlyArray<{
  target: LyricsFormatTarget;
  label: string;
  helper: string;
}> = [
  {
    target: 'apple_music',
    label: 'Apple Music',
    helper: 'Plain structure for DSP ingestion',
  },
  {
    target: 'deezer',
    label: 'Deezer',
    helper: 'Clean lines without section headers',
  },
  {
    target: 'genius',
    label: 'Genius',
    helper: 'Keep section headers for annotation context',
  },
] as const;

interface ReleaseLyricsSectionProps {
  readonly releaseId: string;
  readonly lyrics?: string;
  readonly isEditable: boolean;
  readonly isSaving?: boolean;
  readonly onSaveLyrics?: (releaseId: string, lyrics: string) => Promise<void>;
  readonly onFormatLyrics?: (
    releaseId: string,
    lyrics: string,
    target?: LyricsFormatTarget
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
  const [selectedFormatTarget, setSelectedFormatTarget] =
    useState<LyricsFormatTarget>('apple_music');

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

  const selectedFormat = useMemo(
    () =>
      FORMAT_OPTIONS.find(option => option.target === selectedFormatTarget) ??
      FORMAT_OPTIONS[0],
    [selectedFormatTarget]
  );

  const handleFormatLyrics = useCallback(async () => {
    if (!onFormatLyrics) {
      return;
    }

    setIsFormatting(true);
    try {
      const changes = await onFormatLyrics(
        releaseId,
        draftLyrics,
        selectedFormatTarget
      );
      if (changes.length > 0) {
        toast.info(changes.join(' · '));
      }
      toast.success(`Lyrics formatted for ${selectedFormat.label}`);
    } catch {
      toast.error('Unable to format lyrics right now');
    } finally {
      setIsFormatting(false);
    }
  }, [
    draftLyrics,
    onFormatLyrics,
    releaseId,
    selectedFormat.label,
    selectedFormatTarget,
  ]);

  const formatDropdownItems = useMemo<CommonDropdownItem[]>(
    () =>
      FORMAT_OPTIONS.map(option => ({
        type: 'action',
        id: option.target,
        label: option.label,
        description: option.helper,
        onClick: () => setSelectedFormatTarget(option.target),
      })),
    []
  );

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

      <div className='mt-3 flex flex-wrap items-center gap-2'>
        {isEditable && onFormatLyrics && (
          <div className='flex items-center overflow-hidden rounded-full border border-border/70 bg-surface-2'>
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='rounded-none border-0'
              onClick={handleFormatLyrics}
              disabled={isFormatting || isSaving || !draftLyrics.trim()}
            >
              <Sparkles className='h-4 w-4' />
              {isFormatting
                ? 'Formatting…'
                : `Format for ${selectedFormat.label}`}
            </Button>
            <CommonDropdown
              size='compact'
              align='end'
              items={formatDropdownItems}
              trigger={
                <button
                  type='button'
                  className='flex h-8 items-center justify-center border-l border-border/70 px-2 text-secondary-token transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50'
                  aria-label='Choose lyrics format target'
                  disabled={isFormatting || isSaving || !draftLyrics.trim()}
                >
                  <ChevronDown className='h-4 w-4' aria-hidden='true' />
                </button>
              }
            />
          </div>
        )}

        <Button
          type='button'
          size='sm'
          variant='secondary'
          onClick={async () => {
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
          }}
          disabled={isCopying || !draftLyrics.trim()}
        >
          <Copy className='h-4 w-4' />
          {isCopying ? 'Copying…' : 'Copy lyrics'}
        </Button>
      </div>
    </DrawerSection>
  );
}
