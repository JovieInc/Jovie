'use client';

// @coverage-via apps/web/components/organisms/home-loop/HomeLoopCanvas.test.tsx
import { Button, Input } from '@jovie/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import { ArrowUp, Check, ChevronRight } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import {
  formatCountdown,
  type HomeLoopAsk,
  isAskEvidenceMissing,
} from '@/lib/home-loop/contract';
import { cn } from '@/lib/utils';
import { useFitList } from './useFitList';

export type HomeLoopAnswerState = 'pending' | 'sent' | 'failed';

export interface HomeLoopAnswer {
  /** What the user chose or wrote, shown in place of the controls. */
  readonly label: string;
  readonly state: HomeLoopAnswerState;
}

const CARD_FRAME = 'flex flex-col gap-2 rounded-lg bg-surface-1 px-3 py-2';
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

/** Inline links shown on a review ask; the rest stay under "Why". */
const INLINE_EVIDENCE_LINKS = 3;

/**
 * Review asks show what is being certified next to the action. With nothing
 * attached the line says so and the action stays disabled.
 */
function EvidenceLine({ ask }: Readonly<{ readonly ask: HomeLoopAsk }>) {
  if (!ask.requiresEvidence) return null;
  if (isAskEvidenceMissing(ask))
    return (
      <p
        className='text-xs text-warning'
        data-testid='home-loop-ask-evidence-missing'
      >
        Evidence missing
      </p>
    );
  return (
    <p
      className='flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs text-secondary-token'
      data-testid='home-loop-ask-evidence'
    >
      {ask.evidenceSummary ? (
        <span className='truncate'>{ask.evidenceSummary}</span>
      ) : null}
      {ask.evidence.slice(0, INLINE_EVIDENCE_LINKS).map((url, index) => (
        <a
          key={url}
          href={url}
          target='_blank'
          rel='noreferrer'
          className='text-secondary-token underline underline-offset-2 hover:text-primary-token'
        >
          {`Evidence ${index + 1}`}
        </a>
      ))}
    </p>
  );
}

/** Actions and the answered line share one slot height. */
const ACTION_SLOT = 'flex min-h-9 flex-wrap items-center gap-1.5';

function WhyDetails({ ask }: Readonly<{ readonly ask: HomeLoopAsk }>) {
  return (
    <>
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
    </>
  );
}

function AskCard({
  ask,
  answer,
  approveLabel,
  bounded,
  onHiddenFocus,
  onApprove,
  onReply,
  onFeedback,
}: Readonly<{
  readonly ask: HomeLoopAsk;
  readonly answer: HomeLoopAnswer | undefined;
  readonly approveLabel: string;
  readonly bounded: boolean;
  readonly onHiddenFocus: () => void;
  readonly onApprove: (ask: HomeLoopAsk, option?: string) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  readonly onFeedback?: (ask: HomeLoopAsk, text: string) => void;
}>) {
  const [whyOpen, setWhyOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const whyId = useId();
  const cardRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const card = cardRef.current;
    if (!bounded || !whyOpen || !card) return;
    // Fitting hides rather than unmounts cards. Close intentional detail when
    // its trigger disappears, before it can float detached from the list.
    const closeIfHidden = () => {
      if (card.getAttribute('aria-hidden') === 'true') setWhyOpen(false);
    };
    const observer = new MutationObserver(closeIfHidden);
    observer.observe(card, {
      attributes: true,
      attributeFilter: ['aria-hidden'],
    });
    closeIfHidden();
    return () => observer.disconnect();
  }, [bounded, whyOpen]);
  const answered = answer && answer.state !== 'failed';
  // A review action without evidence would certify nothing.
  const evidenceMissing = isAskEvidenceMissing(ask);

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

  const whyButton = (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='shrink-0'
      aria-controls={whyId}
      aria-expanded={whyOpen}
      onClick={bounded ? undefined : () => setWhyOpen(open => !open)}
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
  );
  const card = (
    <li
      ref={cardRef}
      className={cn(CARD_FRAME, 'shrink-0', answered && 'opacity-70')}
      data-answer-state={answer?.state ?? 'open'}
      data-fit-item
      data-testid='home-loop-ask'
    >
      <div className='flex min-w-0 flex-col gap-0.5'>
        <div className='flex items-start justify-between gap-2'>
          <h3 className='line-clamp-2 text-balance text-sm font-medium text-primary-token'>
            {ask.escalation ? (
              <span
                className={cn(
                  'mr-1.5 inline-flex rounded-full px-1.5 align-middle text-2xs font-semibold tabular-nums',
                  ask.escalation.level === 2
                    ? 'bg-error-subtle text-error'
                    : 'bg-warning-subtle text-warning'
                )}
                data-testid='home-loop-ask-escalation'
              >
                {`Waiting ${ask.escalation.waitingHours}h`}
              </span>
            ) : null}
            {ask.title}
          </h3>
          {bounded ? (
            <PopoverTrigger asChild>{whyButton}</PopoverTrigger>
          ) : (
            whyButton
          )}
        </div>
        <p
          className='line-clamp-2 text-xs text-secondary-token'
          title={ask.recommendation}
        >
          {ask.recommendation}
        </p>
        <EvidenceLine ask={ask} />
        <DefaultLine ask={ask} />
        {bounded ? (
          <PopoverContent
            id={whyId}
            aria-label={`Why: ${ask.title}`}
            align='end'
            className='w-80 whitespace-pre-line'
            onCloseAutoFocus={event => {
              if (cardRef.current?.getAttribute('aria-hidden') === 'true') {
                event.preventDefault();
                onHiddenFocus();
              }
            }}
            testId='home-loop-ask-why'
          >
            <WhyDetails ask={ask} />
          </PopoverContent>
        ) : (
          <div
            id={whyId}
            hidden={!whyOpen}
            className='whitespace-pre-line pt-1 text-xs text-secondary-token'
          >
            <WhyDetails ask={ask} />
          </div>
        )}
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
          {ask.decidable && ask.options?.length
            ? ask.options.map((option, index) => (
                <Button
                  key={option}
                  type='button'
                  size='sm'
                  variant={index === 0 ? 'primary' : 'secondary'}
                  disabled={evidenceMissing}
                  onClick={() => onApprove(ask, option)}
                  data-testid='home-loop-ask-option'
                >
                  {option}
                </Button>
              ))
            : null}
          {ask.decidable && !ask.options?.length ? (
            <Button
              type='button'
              size='sm'
              disabled={evidenceMissing}
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
  return bounded ? (
    <Popover open={whyOpen} onOpenChange={setWhyOpen}>
      {card}
    </Popover>
  ) : (
    card
  );
}

function MoreDecisions({
  hidden,
  moreHref,
}: Readonly<{ readonly hidden: number; readonly moreHref?: string }>) {
  const label = `+${hidden} more ${hidden === 1 ? 'decision' : 'decisions'}`;
  return moreHref ? (
    <a
      href={moreHref}
      className='hover:text-primary-token hover:underline focus-visible:underline'
      data-testid='home-loop-asks-more'
    >
      {label}
    </a>
  ) : (
    <span data-testid='home-loop-asks-more'>{label}</span>
  );
}

/**
 * "Blocked on you": one-click answers with the reasoning collapsed.
 *
 * `fit` lets the list fill its bounded parent and replace whatever does not
 * fit with "+N more" (Home never scrolls); otherwise the first `maxVisible`
 * asks show.
 */
export function HomeLoopAsks({
  asks,
  answers,
  approveLabel = 'Approve',
  maxVisible = 3,
  fit = false,
  moreHref,
  onApprove,
  onReply,
  onFeedback,
}: Readonly<{
  readonly asks: readonly HomeLoopAsk[];
  /** Dense Home shows the top asks; the rest live behind `moreHref`. */
  readonly maxVisible?: number;
  readonly fit?: boolean;
  readonly moreHref?: string;
  readonly answers: Readonly<Record<string, HomeLoopAnswer>>;
  readonly approveLabel?: string;
  readonly onApprove: (ask: HomeLoopAsk, option?: string) => void;
  readonly onReply: (ask: HomeLoopAsk, text: string) => void;
  readonly onFeedback?: (ask: HomeLoopAsk, text: string) => void;
}>) {
  const overflowRef = useRef<HTMLParagraphElement>(null);
  const visible = fit ? asks : asks.slice(0, maxVisible);
  const { ref, hidden: fitHidden } = useFitList<HTMLUListElement>(
    visible.map(ask => ask.id).join('|'),
    fit
  );
  const hidden = fit ? fitHidden : asks.length - visible.length;
  const cards = visible.map(ask => (
    <AskCard
      key={ask.id}
      ask={ask}
      answer={answers[ask.id]}
      approveLabel={approveLabel}
      bounded={fit}
      onHiddenFocus={() => {
        const overflow = overflowRef.current;
        (overflow?.querySelector('a') ?? overflow)?.focus();
      }}
      onApprove={onApprove}
      onReply={onReply}
      onFeedback={onFeedback}
    />
  ));
  if (fit) {
    return (
      <div className='flex min-h-0 flex-1 flex-col gap-1'>
        <ul
          ref={ref}
          className='relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden'
          data-testid='home-loop-asks'
        >
          {cards}
        </ul>
        <p
          ref={overflowRef}
          tabIndex={-1}
          className='h-4 shrink-0 px-1 text-xs tabular-nums text-tertiary-token'
        >
          {hidden > 0 ? (
            <MoreDecisions hidden={hidden} moreHref={moreHref} />
          ) : null}
        </p>
      </div>
    );
  }
  return (
    <ul className='flex flex-col gap-2' data-testid='home-loop-asks'>
      {cards}
      {hidden > 0 ? (
        <li className='px-1 text-xs tabular-nums text-tertiary-token'>
          <MoreDecisions hidden={hidden} moreHref={moreHref} />
        </li>
      ) : null}
    </ul>
  );
}

export function HomeLoopAsksSkeleton() {
  return (
    <div className='flex flex-col gap-2'>
      {(['a1', 'a2'] as const).map(slot => (
        <div key={slot} className={CARD_FRAME}>
          <LoadingSkeleton height='h-4' width='w-3/5' />
          <LoadingSkeleton height='h-3' width='w-4/5' />
          <LoadingSkeleton height='h-8' width='w-28' />
        </div>
      ))}
    </div>
  );
}
