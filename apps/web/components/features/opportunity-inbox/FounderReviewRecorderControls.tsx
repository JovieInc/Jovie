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

interface RecorderHeaderProps {
  readonly sessionActive: boolean;
  readonly saving: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
}

function RecorderHeader({
  sessionActive,
  saving,
  onStart,
  onStop,
}: RecorderHeaderProps) {
  const sessionLabel = sessionActive ? 'Recording this card' : 'Mic off';
  const buttonLabel = sessionActive ? 'Stop And Save' : 'Start Session';
  const buttonAction = sessionActive ? onStop : onStart;
  const buttonVariant = sessionActive ? 'secondary' : 'primary';
  return (
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
            {sessionLabel} · ⌘/Ctrl Shift M
          </p>
        </div>
      </div>
      <Button
        type='button'
        size='sm'
        variant={buttonVariant}
        disabled={saving}
        aria-pressed={sessionActive}
        onClick={buttonAction}
      >
        {sessionActive ? (
          <Square className='mr-1.5 size-3.5 fill-current' />
        ) : (
          <Mic className='mr-1.5 size-3.5' />
        )}
        {buttonLabel}
      </Button>
    </div>
  );
}

interface RecorderStatusProps {
  readonly error: string | null;
  readonly latestReceipt: FounderReviewReceipt | null;
  readonly saving: boolean;
  readonly onDeleteAudio: () => void;
}

function RecorderStatus({
  error,
  latestReceipt,
  saving,
  onDeleteAudio,
}: RecorderStatusProps) {
  if (error) {
    return (
      <p
        className='min-h-12 rounded-md border border-status-error/30 bg-status-error/5 px-3 py-2 text-xs text-status-error'
        role='alert'
      >
        {error}
      </p>
    );
  }
  if (!latestReceipt) return null;

  const retentionLabel = latestReceipt.recording.mediaAvailable
    ? 'private audio retained'
    : 'transcript only';
  return (
    <div className='flex min-h-12 items-center justify-between gap-3 rounded-md bg-surface-1 px-3 py-2 text-xs text-secondary-token'>
      <span>
        Saved · {latestReceipt.target.title} · {retentionLabel} · action{' '}
        {latestReceipt.actionOutcome.status.replace('-', ' ')}
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
  );
}

interface RecorderActionsProps {
  readonly target: FounderReviewTarget;
  readonly typedText: string;
  readonly transcript: string;
  readonly saving: boolean;
  readonly onSaveNote: () => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}

function RecorderActions({
  target,
  typedText,
  transcript,
  saving,
  onSaveNote,
  onApprove,
  onReject,
}: RecorderActionsProps) {
  if (target.type === 'founder-note') {
    const noteIsEmpty = !typedText.trim() && !transcript.trim();
    return (
      <Button
        type='button'
        disabled={saving || noteIsEmpty}
        onClick={onSaveNote}
      >
        {saving ? 'Saving…' : 'Save Brain Dump'}
      </Button>
    );
  }
  return (
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
  );
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
      <RecorderHeader
        sessionActive={sessionActive}
        saving={saving}
        onStart={onStart}
        onStop={onStop}
      />

      <div className='mt-4 min-h-20 rounded-md border border-subtle bg-surface-0 p-3'>
        <p className='mb-1 text-2xs font-medium text-tertiary-token'>
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
          <span>Keep private audio after saving</span>
        </label>
        <label className='flex min-h-9 items-center gap-2 rounded-md border border-subtle px-3 py-2'>
          <input
            type='checkbox'
            checked={allowContentUse}
            disabled={saving}
            onChange={event => onAllowContentUseChange(event.target.checked)}
          />
          <span>Allow this material in future content</span>
        </label>
      </div>
      <p className='mt-2 text-2xs text-quaternary-token'>
        Default: transcript only, no content reuse. A recorded thought never
        authorizes publishing or another external action.
      </p>

      <div className='mt-3 min-h-12' aria-live='polite'>
        <RecorderStatus
          error={error}
          latestReceipt={latestReceipt}
          saving={saving}
          onDeleteAudio={onDeleteAudio}
        />
      </div>

      <div className='mt-4 flex min-h-10 items-center justify-end gap-2'>
        <RecorderActions
          target={target}
          typedText={typedText}
          transcript={transcript}
          saving={saving}
          onSaveNote={onSaveNote}
          onApprove={onApprove}
          onReject={onReject}
        />
      </div>
    </section>
  );
}
