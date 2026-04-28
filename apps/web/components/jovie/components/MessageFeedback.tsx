'use client';

import { SimpleTooltip } from '@jovie/ui';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useCallback, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type FeedbackReason =
  | 'wrong'
  | 'outdated'
  | 'generic'
  | 'hallucinated'
  | 'bad_source'
  | 'bad_tone'
  | 'incomplete';

const REASON_OPTIONS: ReadonlyArray<{ value: FeedbackReason; label: string }> =
  [
    { value: 'wrong', label: 'Wrong' },
    { value: 'outdated', label: 'Outdated' },
    { value: 'generic', label: 'Too generic' },
    { value: 'hallucinated', label: 'Made up' },
    { value: 'bad_source', label: 'Bad source' },
    { value: 'bad_tone', label: 'Tone off' },
    { value: 'incomplete', label: 'Incomplete' },
  ];

const CORRECTION_MAX = 2000;
const STATUS_FADE_MS = 4000;

interface MessageFeedbackProps {
  readonly traceId: string;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'up_pending' }
  | { kind: 'up_saved' }
  | { kind: 'down_picking_reason' }
  | { kind: 'down_writing'; reason: FeedbackReason }
  | { kind: 'down_saving' }
  | { kind: 'down_saved' }
  | { kind: 'error'; message: string };

/**
 * Per-assistant-message feedback: thumbs up/down, reason picker on
 * thumbs-down (progressive disclosure), optional correction textarea.
 *
 * UX contract (from /autoplan design phase):
 *   - Thumbs always visible at rest
 *   - ↑ = single click + fill, never asks for a reason
 *   - ↓ = fill + reveal reason chips inline; pick reason → reveal
 *     optional correction textarea; submit → "Saved" inline (4s fade)
 *   - "Saved" copy, NEVER "Queued for review" (no SLA exists)
 *   - Inline error preserves selected state for one-click retry
 */
export function MessageFeedback({ traceId }: MessageFeedbackProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const correctionRef = useRef<HTMLTextAreaElement | null>(null);
  const reasonGroupId = useId();

  const submit = useCallback(
    async (
      rating: 'up' | 'down',
      reason: FeedbackReason | null,
      correction: string | null
    ) => {
      const res = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          traceId,
          rating,
          ...(rating === 'down' && reason ? { reason } : {}),
          ...(rating === 'down' && correction ? { correction } : {}),
        }),
      });
      if (!res.ok) {
        const errPayload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errPayload?.error ?? `feedback_${res.status}`);
      }
    },
    [traceId]
  );

  const onUp = useCallback(async () => {
    if (phase.kind === 'up_pending' || phase.kind === 'up_saved') return;
    setPhase({ kind: 'up_pending' });
    try {
      await submit('up', null, null);
      setPhase({ kind: 'up_saved' });
      setTimeout(() => {
        setPhase(prev => (prev.kind === 'up_saved' ? { kind: 'idle' } : prev));
      }, STATUS_FADE_MS);
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Save failed',
      });
    }
  }, [phase.kind, submit]);

  const onDown = useCallback(() => {
    setPhase({ kind: 'down_picking_reason' });
  }, []);

  const onPickReason = useCallback((reason: FeedbackReason) => {
    setPhase({ kind: 'down_writing', reason });
    // Focus correction textarea after the render
    setTimeout(() => correctionRef.current?.focus(), 0);
  }, []);

  const onSubmitDown = useCallback(async () => {
    if (phase.kind !== 'down_writing') return;
    const correction = correctionRef.current?.value.trim() ?? '';
    setPhase({ kind: 'down_saving' });
    try {
      await submit('down', phase.reason, correction || null);
      setPhase({ kind: 'down_saved' });
      setTimeout(() => {
        setPhase(prev =>
          prev.kind === 'down_saved' ? { kind: 'idle' } : prev
        );
      }, STATUS_FADE_MS);
    } catch (err) {
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Save failed',
      });
    }
  }, [phase, submit]);

  const onCancelDown = useCallback(() => {
    setPhase({ kind: 'idle' });
  }, []);

  const isUp = phase.kind === 'up_pending' || phase.kind === 'up_saved';
  const isDown =
    phase.kind === 'down_picking_reason' ||
    phase.kind === 'down_writing' ||
    phase.kind === 'down_saving' ||
    phase.kind === 'down_saved';

  return (
    <div className='flex flex-col gap-1.5' data-testid='chat-feedback'>
      <div className='flex items-center gap-1'>
        <SimpleTooltip content='Helpful'>
          <button
            type='button'
            onClick={onUp}
            disabled={phase.kind === 'up_pending'}
            aria-pressed={isUp}
            aria-label='Helpful'
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full',
              'border border-transparent bg-transparent text-tertiary-token',
              'transition-colors duration-150',
              'hover:bg-surface-1 hover:text-secondary-token',
              'focus-visible:bg-surface-1 focus-visible:outline-none',
              isUp && 'bg-surface-1 text-primary-token'
            )}
          >
            <ThumbsUp className={cn('h-3.5 w-3.5', isUp && 'fill-current')} />
          </button>
        </SimpleTooltip>
        <SimpleTooltip content='Not helpful'>
          <button
            type='button'
            onClick={onDown}
            aria-pressed={isDown}
            aria-label='Not helpful'
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-full',
              'border border-transparent bg-transparent text-tertiary-token',
              'transition-colors duration-150',
              'hover:bg-surface-1 hover:text-secondary-token',
              'focus-visible:bg-surface-1 focus-visible:outline-none',
              isDown && 'bg-surface-1 text-primary-token'
            )}
          >
            <ThumbsDown
              className={cn('h-3.5 w-3.5', isDown && 'fill-current')}
            />
          </button>
        </SimpleTooltip>
        {phase.kind === 'up_saved' && (
          <span
            className='ml-1 text-2xs text-tertiary-token motion-safe:animate-fade-in'
            aria-live='polite'
          >
            Saved
          </span>
        )}
        {phase.kind === 'down_saved' && (
          <span
            className='ml-1 text-2xs text-tertiary-token motion-safe:animate-fade-in'
            aria-live='polite'
          >
            Saved
          </span>
        )}
        {phase.kind === 'error' && (
          <span className='ml-1 text-2xs text-rose-400' role='alert'>
            Couldn&apos;t save — try again
          </span>
        )}
      </div>

      {phase.kind === 'down_picking_reason' && (
        <fieldset
          className='flex flex-wrap items-center gap-1 pl-0.5'
          aria-labelledby={`${reasonGroupId}-label`}
        >
          <legend id={`${reasonGroupId}-label`} className='sr-only'>
            Why wasn&apos;t this helpful?
          </legend>
          {REASON_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type='button'
              onClick={() => onPickReason(opt.value)}
              className={cn(
                'inline-flex h-[22px] items-center rounded-full px-2',
                'bg-[rgba(0,0,0,0.06)] dark:bg-[rgba(255,255,255,0.05)]',
                'text-2xs font-medium tracking-tight text-secondary-token',
                'transition-colors duration-150',
                'hover:bg-[rgba(0,0,0,0.09)] dark:hover:bg-[rgba(255,255,255,0.08)]',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current'
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            type='button'
            onClick={onCancelDown}
            className='ml-1 text-2xs text-tertiary-token hover:text-secondary-token'
          >
            Cancel
          </button>
        </fieldset>
      )}

      {phase.kind === 'down_writing' && (
        <div className='flex flex-col gap-1.5 pl-0.5'>
          <label className='sr-only' htmlFor={`${reasonGroupId}-correction`}>
            Optional correction
          </label>
          <textarea
            id={`${reasonGroupId}-correction`}
            ref={correctionRef}
            maxLength={CORRECTION_MAX}
            placeholder="What's the right answer? (optional)"
            className={cn(
              'min-h-[60px] w-full max-w-[520px] resize-y rounded-md',
              'border border-(--linear-app-frame-seam) bg-surface-1',
              'px-2.5 py-1.5 text-xs text-primary-token placeholder:text-tertiary-token',
              'focus-visible:outline-none focus-visible:border-secondary-token'
            )}
            data-testid='chat-feedback-correction'
          />
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={onSubmitDown}
              className={cn(
                'inline-flex h-7 items-center rounded-full px-3',
                'bg-surface-2 text-2xs font-semibold text-primary-token',
                'transition-colors duration-150 hover:bg-surface-3'
              )}
            >
              Send feedback
            </button>
            <button
              type='button'
              onClick={onCancelDown}
              className='text-2xs text-tertiary-token hover:text-secondary-token'
            >
              Cancel
            </button>
            <span className='text-2xs text-tertiary-token'>
              The Jovie team reviews these. Won&apos;t change the answer.
            </span>
          </div>
        </div>
      )}

      {phase.kind === 'down_saving' && (
        <span
          className='pl-0.5 text-2xs text-tertiary-token'
          aria-live='polite'
        >
          Saving…
        </span>
      )}
    </div>
  );
}
