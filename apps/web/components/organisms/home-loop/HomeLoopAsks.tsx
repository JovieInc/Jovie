'use client';

// @coverage-via apps/web/components/organisms/home-loop/HomeLoopCanvas.test.tsx
import { Button, Input } from '@jovie/ui';
import { ArrowUp, Check, ChevronRight } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { formatCountdown, type HomeLoopAsk } from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';

export type HomeLoopAnswerState = 'pending' | 'sent' | 'failed';

export interface HomeLoopAnswer {
  /** What the user chose or wrote, shown in place of the controls. */
  readonly label: string;
  readonly state: HomeLoopAnswerState;
}

const CARD_FRAME =
  'flex flex-col gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2';
/** Minute-resolution clock for deadline countdowns. */
function useNowMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function DefaultLine({ ask }: Readonly<{ readonly ask: HomeLoopAsk }>) {
  const now = useNowMinute();
  const fallback = ask.decisionDefault;
  if (!fallback) return null;
  const countdown = formatCountdown(fallback.deadline, now);
  const verb = fallback.decision === 'approve' ? 'Approves' : 'Rejects';
  return (
    <p
      className='flex flex-wrap items-baseline gap-x-1.5 text-xs text-tertiary-token'
      data-testid='home-loop-ask-default'
    >
      <span>
        {countdown === 'now'
          ? `Default due: ${verb.toLowerCase()} — ${fallback.summary}`
          : `${verb} by default — ${fallback.summary}`}
      </span>
      {countdown && countdown !== 'now' ? (
        <time
          className='tabular-nums text-secondary-token'
          dateTime={fallback.deadline}
          data-testid='home-loop-ask-countdown'
        >
          {countdown}
        </time>
      ) : null}
    </p>
  );
}

/** Actions and the answered line share one slot height. */
const ACTION_SLOT = 'flex min-h-9 flex-wrap items-center gap-1.5';

function AskCard({
  ask,
  answer,
  approveLabel,
  onApprove,
  onReply,
  onFeedback,
}: Readonly<{
  readonly ask: HomeLoopAsk;
  readonly answer: HomeLoopAnswer | undefined;
  readonly approveLabel: string;
  readonly onApprove: (ask: HomeLoopAsk) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  readonly onFeedback?: (ask: HomeLoopAsk, text: string) => void;
}>) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const whyId = useId();
  const answered = answer && answer.state !== 'failed';

  function submitFeedback(event: FormEvent) {
    event.preventDefault();
    const text = feedback.trim();
    if (!text || !onFeedback) return;
    onFeedback(ask, text);
    setFeedback('');
    setFeedbackOpen(false);
  }

  function submitReply(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onReply(ask, text);
    setDraft('');
  }

  return (
    <li
      className={cn(CARD_FRAME, answered && 'opacity-70')}
      data-answer-state={answer?.state ?? 'open'}
      data-testid='home-loop-ask'
    >
      <div className='flex min-w-0 flex-col gap-0.5'>
        <h3 className='text-balance text-sm font-medium text-primary-token'>
          {ask.title}
        </h3>
        <p className='text-xs text-secondary-token'>{ask.recommendation}</p>
        <DefaultLine ask={ask} />
      </div>

      <div>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          aria-controls={whyId}
          aria-expanded={whyOpen}
          onClick={() => setWhyOpen(open => !open)}
        >
          <ChevronRight
            aria-hidden='true'
            className={cn(
              'size-3 transition-transform duration-subtle motion-reduce:transition-none',
              whyOpen && 'rotate-90'
            )}
          />
          Why
        </Button>
        <div
          id={whyId}
          hidden={!whyOpen}
          className='whitespace-pre-line pt-1 text-xs text-secondary-token'
        >
          {ask.why}
          {ask.evidence.length > 0 ? (
            <ul className='mt-1.5 flex flex-wrap gap-x-3'>
              {ask.evidence.map((url, index) => (
                <li key={url}>
                  <a
                    href={url}
                    target='_blank'
                    rel='noreferrer'
                    className='text-tertiary-token underline-offset-2 hover:underline'
                  >
                    {`Evidence ${index + 1}`}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {answered ? (
        <p
          className={cn(ACTION_SLOT, 'text-xs text-secondary-token')}
          role='status'
        >
          <Check aria-hidden='true' className='size-3.5 text-success' />
          <span className='truncate'>{answer.label}</span>
          {answer.state === 'pending' ? (
            <span className='text-tertiary-token'>Sending</span>
          ) : null}
          {answer.state === 'sent' && ask.canFeedback && onFeedback ? (
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-expanded={feedbackOpen}
              onClick={() => setFeedbackOpen(open => !open)}
            >
              Add Feedback
            </Button>
          ) : null}
        </p>
      ) : (
        <div className={ACTION_SLOT}>
          {ask.decidable ? (
            <Button
              type='button'
              size='sm'
              onClick={() => onApprove(ask)}
              data-testid='home-loop-ask-approve'
            >
              {ask.actionLabel ?? approveLabel}
            </Button>
          ) : null}
          {ask.canReply ? (
            <form
              className='flex min-w-40 flex-1 items-center gap-1'
              onSubmit={submitReply}
            >
              <Input
                inputSize='sm'
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder='Something else…'
                aria-label={`Reply: ${ask.title}`}
              />
              <Button
                type='submit'
                variant='secondary'
                size='icon-sm'
                aria-label='Send Reply'
                disabled={!draft.trim()}
              >
                <ArrowUp aria-hidden='true' className='size-3.5' />
              </Button>
            </form>
          ) : null}
          {answer?.state === 'failed' ? (
            <span className='text-xs text-error' role='alert'>
              {answer.label}
            </span>
          ) : null}
          {!ask.decidable && !ask.canReply ? (
            <span className='text-xs text-tertiary-token'>
              Answer in the linked work
            </span>
          ) : null}
        </div>
      )}
      {feedbackOpen ? (
        <form className='flex items-center gap-1' onSubmit={submitFeedback}>
          <Input
            inputSize='sm'
            value={feedback}
            onChange={event => setFeedback(event.target.value)}
            placeholder='What should change?'
            aria-label={`Feedback: ${ask.title}`}
          />
          <Button
            type='submit'
            variant='secondary'
            size='icon-sm'
            aria-label='Send Feedback'
            disabled={!feedback.trim()}
          >
            <ArrowUp aria-hidden='true' className='size-3.5' />
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/** "Blocked on you": one-click answers with the reasoning collapsed. */
export function HomeLoopAsks({
  asks,
  answers,
  approveLabel = 'Approve',
  maxVisible = 3,
  moreHref,
  onApprove,
  onReply,
  onFeedback,
}: Readonly<{
  readonly asks: readonly HomeLoopAsk[];
  /** Dense Home shows the top asks; the rest live behind `moreHref`. */
  readonly maxVisible?: number;
  readonly moreHref?: string;
  readonly answers: Readonly<Record<string, HomeLoopAnswer>>;
  readonly approveLabel?: string;
  readonly onApprove: (ask: HomeLoopAsk) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  readonly onFeedback?: (ask: HomeLoopAsk, text: string) => void;
}>) {
  const visible = asks.slice(0, maxVisible);
  const hidden = asks.length - visible.length;
  return (
    <ul className='flex flex-col gap-2' data-testid='home-loop-asks'>
      {visible.map(ask => (
        <AskCard
          key={ask.id}
          ask={ask}
          answer={answers[ask.id]}
          approveLabel={approveLabel}
          onApprove={onApprove}
          onReply={onReply}
          onFeedback={onFeedback}
        />
      ))}
      {hidden > 0 ? (
        <li className='px-1 text-xs tabular-nums text-tertiary-token'>
          {moreHref ? (
            <a
              href={moreHref}
              className='hover:text-primary-token hover:underline focus-visible:underline'
              data-testid='home-loop-asks-more'
            >
              {`${hidden} more ${hidden === 1 ? 'decision' : 'decisions'}`}
            </a>
          ) : (
            `${hidden} more ${hidden === 1 ? 'decision' : 'decisions'}`
          )}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * Mirrors the populated geometry (title, recommendation, Why, action slot,
 * three cards) so the sections below do not move when asks arrive.
 */
export function HomeLoopAsksSkeleton() {
  return (
    <div className='flex flex-col gap-2'>
      {(['a1', 'a2', 'a3'] as const).map(slot => (
        <div key={slot} className={CARD_FRAME}>
          <div className='flex flex-col gap-1.5'>
            <LoadingSkeleton height='h-4' width='w-3/5' />
            <LoadingSkeleton height='h-3' width='w-4/5' />
          </div>
          <LoadingSkeleton height='h-8' width='w-16' />
          <div className={ACTION_SLOT}>
            <LoadingSkeleton height='h-7' width='w-20' />
          </div>
        </div>
      ))}
    </div>
  );
}
