'use client';

import { Button, Textarea } from '@jovie/ui';
import { Copy, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DrawerSection } from '@/components/molecules/drawer';

interface ReleaseLyricsSectionProps {
  readonly releaseId: string;
  readonly lyrics?: string;
  readonly isEditable: boolean;
  readonly isSaving?: boolean;
  readonly onSaveLyrics?: (releaseId: string, lyrics: string) => Promise<void>;
  readonly onFormatLyrics?: (
    releaseId: string,
    lyrics: string
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

  useEffect(() => {
    setDraftLyrics(lyrics ?? '');
  }, [lyrics, releaseId]);

  const hasUnsavedChanges = useMemo(
    () => draftLyrics !== (lyrics ?? ''),
    [draftLyrics, lyrics]
  );

  return (
    <DrawerSection title='Lyrics'>
      <div className='space-y-2'>
        <p className='text-xs font-medium text-secondary-token'>Raw lyrics</p>
        <Textarea
          placeholder='Paste your lyrics here'
          value={draftLyrics}
          onChange={event => setDraftLyrics(event.target.value)}
          rows={10}
          disabled={!isEditable || isSaving}
          className='resize-y'
        />
      </div>

      <div className='mt-3 flex flex-wrap items-center gap-2'>
        {isEditable && onFormatLyrics && (
          <Button
            type='button'
            size='sm'
            variant='secondary'
            onClick={async () => {
              setIsFormatting(true);
              try {
                const changes = await onFormatLyrics(releaseId, draftLyrics);
                if (changes.length > 0) {
                  toast.info(changes.join(' · '));
                }
              } catch {
                toast.error('Unable to format lyrics right now');
              } finally {
                setIsFormatting(false);
              }
            }}
            disabled={isFormatting || isSaving || !draftLyrics.trim()}
          >
            <Sparkles className='h-4 w-4' />
            {isFormatting ? 'Formatting…' : 'Format for Apple Music'}
          </Button>
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

        {isEditable && onSaveLyrics && (
          <Button
            type='button'
            size='sm'
            variant='primary'
            onClick={() => void onSaveLyrics(releaseId, draftLyrics)}
            disabled={!hasUnsavedChanges || isSaving || isFormatting}
          >
            {isSaving ? 'Saving…' : 'Save lyrics'}
          </Button>
        )}
      </div>
    </DrawerSection>
  );
}
