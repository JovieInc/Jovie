'use client';

import { Button } from '@jovie/ui';
import { AudioLines, Mic, Square, Trash2 } from 'lucide-react';
import type {
  FounderReviewReceipt,
  FounderReviewTarget,
} from '@/lib/founder-review/contract';
import { cn } from '@/lib/utils';

interface FounderReviewRecorderControlsProps {
  readonly target: FounderReviewTarget;
  readonly sessionActive: boolean;
  readonly transcript: string;
  readonly typedText: string;
  readonly keepAudio: boolean;
  readonly allowContentUse: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly latestReceipt: FounderReviewReceipt | null;
  readonly className?: string;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onTypedTextChange: (value: string) => void;
  readonly onKeepAudioChange: (value: boolean) => void;
  readonly onAllowContentUseChange: (value: boolean) => void;
  readonly onDeleteAudio: () => void;
  readonly onSaveNote: () => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

export function FounderReviewRecorderControls({
  target,
  sessionActive,
  transcript,
  typedText,
  keepAudio,
  allowContentUse,
  saving,
  error,
  latestReceipt,
  className,
  onStart,
  onStop,
  onTypedTextChange,
  onKeepAudioChange,
  onAllowContentUseChange,
  onDeleteAudio,
  onSaveNote,
  onApprove,
  onReject,
}: FounderReviewRecorderControlsProps) {
  return (
    <section
      className={cn('border-subtle border-t pt-4', className)}
      aria-label='Founder Review Recording'
      data-testid='founder-review-recorder'
    >
      <div className='flex min-h-9 flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <AudioLines
            className={cn(
              'size-4',
              sessionActive ? 'text-accent-red' : 'text-tertiary-token'
            )}
          />
          <div>
            <p className='text-sm font-medium text-primary-token'>
              Founder Review
            </p>
            <p className='text-2xs text-tertiary-token'>
              {sessionActive ? 'Recording this card' : 'Mic off'} · ⌘/Ctrl Shift
              M
            </p>
          </div>
        </div>
        <Button
          type='button'
          size='sm'
          variant={sessionActive ? 'secondary' : 'primary'}
          disabled={saving}
          aria-pressed={sessionActive}
          onClick={sessionActive ? onStop : onStart}
        >
          {sessionActive ? (
            <Square className='mr-1.5 size-3.5 fill-current' />
          ) : (
            <Mic className='mr-1.5 size-3.5' />
          )}
          {sessionActive ? 'Stop And Save' : 'Start Session'}
        </Button>
      </div>

      <div className='mt-4 min-h-20 rounded-md border border-subtle bg-surface-0 p-3'>
        <p className='mb-1 text-2xs font-medium uppercase tracking-wide text-tertiary-token'>
          Live Transcript
        </p>
        <p
          className='line-clamp-3 text-sm text-secondary-token'
          aria-live='polite'
        >
          {transcript || 'Your dictation will stay bound to this card.'}
        </p>
      </div>

      <label
        className='mt-3 block text-xs font-medium text-secondary-token'
        htmlFor={`founder-note-${target.id}`}
      >
        Typed fallback or refinement
      </label>
      <textarea
        id={`founder-note-${target.id}`}
        value={typedText}
        rows={target.type === 'founder-note' ? 2 : 3}
        disabled={saving}
        className='mt-1 w-full resize-y rounded-md border border-subtle bg-surface-0 px-3 py-2 text-sm text-primary-token outline-none placeholder:text-quaternary-token focus-visible:ring-2 focus-visible:ring-ring/50'
        placeholder='Add context, even when the microphone is unavailable'
        onChange={event => onTypedTextChange(event.target.value)}
      />

      <div className='mt-3 grid gap-2 text-xs text-secondary-token sm:grid-cols-2'>
        <label className='flex min-h-9 items-center gap-2 rounded-md border border-subtle px-3 py-2'>
          <input
            type='checkbox'
            checked={keepAudio}
            disabled={saving}
            onChange={event => onKeepAudioChange(event.target.checked)}
          />
          Keep private audio after saving
        </label>
        <label className='flex min-h-9 items-center gap-2 rounded-md border border-subtle px-3 py-2'>
          <input
            type='checkbox'
            checked={allowContentUse}
            disabled={saving}
            onChange={event => onAllowContentUseChange(event.target.checked)}
          />
          Allow this material in future content
        </label>
      </div>
      <p className='mt-2 text-2xs text-quaternary-token'>
        Default: transcript only, no content reuse. A recorded thought never
        authorizes publishing or another external action.
      </p>

      {error ? (
        <p
          className='mt-3 min-h-9 rounded-md border border-status-error/30 bg-status-error/5 px-3 py-2 text-xs text-status-error'
          role='alert'
        >
          {error}
        </p>
      ) : (
        <div className='mt-3 min-h-9' aria-live='polite'>
          {latestReceipt ? (
            <div className='flex items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2 text-xs text-secondary-token'>
              <span>
                Saved · {latestReceipt.target.title} ·{' '}
                {latestReceipt.recording.mediaAvailable
                  ? 'private audio retained'
                  : 'transcript only'}
              </span>
              {latestReceipt.recording.mediaAvailable ? (
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  disabled={saving}
                  onClick={onDeleteAudio}
                >
                  <Trash2 className='mr-1.5 size-3.5' /> Delete Audio
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <div className='mt-4 flex min-h-10 items-center justify-end gap-2'>
        {target.type === 'founder-note' ? (
          <Button
            type='button'
            disabled={saving || (!typedText.trim() && !transcript.trim())}
            onClick={onSaveNote}
          >
            {saving ? 'Saving…' : 'Save Brain Dump'}
          </Button>
        ) : (
          <>
            <Button
              type='button'
              variant='secondary'
              disabled={saving}
              onClick={onReject}
            >
              Reject
            </Button>
            <Button type='button' disabled={saving} onClick={onApprove}>
              {saving ? 'Saving Decision…' : 'Approve'}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
