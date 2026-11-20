'use client';

import { Button } from '@jovie/ui';
import Link from 'next/link';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import type {
  DecisionCardDefault,
  DecisionCardView,
} from '@/lib/ovie/decision-card-view';
import { cn } from '@/lib/utils';

/**
 * One Ovie decision, readable in seconds (`jovie.decision-card-copy/v1`):
 * the decision, what the deadline records and when, up to three facts with
 * evidence, then Approve / Reject / Discuss. Swipe and arrow keys accelerate
 * the visible buttons; they are never the only path.
 *
 * The card paints no surface of its own: the parent (Inbox panel) owns it.
 */

export type DecisionCardStatus =
  | { readonly kind: 'pending' }
  | { readonly kind: 'submitting'; readonly decision: 'approve' | 'reject' }
  | {
      readonly kind: 'decided';
      readonly decision: 'approve' | 'reject';
      /** `default`: the deadline recorded it (auto-shipped). */
      readonly by: 'founder' | 'default';
    }
  | { readonly kind: 'error'; readonly message: string };

/** Horizontal travel that commits a swipe. */
export const DECISION_CARD_SWIPE_COMMIT_PX = 96;

function DefaultLine({
  fallback,
}: Readonly<{ readonly fallback: DecisionCardDefault }>) {
  const verb = fallback.decision === 'approve' ? 'Approves' : 'Rejects';
  const when =
    fallback.relative === null ? `${verb} now` : `${verb} ${fallback.relative}`;
  return (
    <p
      className='flex min-w-0 items-baseline gap-1.5 text-xs text-tertiary-token'
      data-testid='decision-card-default'
      data-tone={fallback.tone}
    >
      <time
        dateTime={fallback.deadline}
        className={cn(
          'shrink-0 font-medium tabular-nums',
          fallback.tone === 'calm' ? 'text-secondary-token' : 'text-warning'
        )}
      >
        {when}
      </time>
      {fallback.conflict ? (
        <span className='truncate text-warning'>
          Filed default text says otherwise
        </span>
      ) : fallback.summary ? (
        <span className='truncate' title={fallback.summary}>
          {fallback.summary}
        </span>
      ) : null}
    </p>
  );
}

function WaitingLine({
  waiting,
}: Readonly<{ readonly waiting: NonNullable<DecisionCardView['waiting']> }>) {
  return (
    <p
      className='flex items-baseline gap-1.5 text-xs text-tertiary-token'
      data-testid='decision-card-default'
      data-tone={waiting.level > 0 ? 'near' : 'calm'}
    >
      <span
        className={cn(
          'font-medium tabular-nums',
          waiting.level > 0 ? 'text-warning' : 'text-secondary-token'
        )}
      >
        {`Waiting ${waiting.hours}h`}
      </span>
      <span>No default</span>
    </p>
  );
}

const DECIDED_LABEL = {
  approve: { founder: 'Approved', default: 'Approved by default' },
  reject: { founder: 'Rejected', default: 'Rejected by default' },
} as const;

/** Actions and their replacements share one slot so nothing shifts. */
const ACTION_SLOT = 'flex min-h-8 items-center gap-2';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    setReduced(query.matches);
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('a,button,input,textarea,select,summary') !== null
  );
}

export function DecisionCard({
  view,
  status,
  approveLabel = 'Approve',
  discussHref,
  onApprove,
  onReject,
  onRetry,
}: Readonly<{
  readonly view: DecisionCardView;
  readonly status: DecisionCardStatus;
  readonly approveLabel?: string;
  /** Opens a Summer conversation about this decision. */
  readonly discussHref: string;
  readonly onApprove: () => void;
  /** Absent: the source has no reject path, so no Reject control renders. */
  readonly onReject?: () => void;
  readonly onRetry?: () => void;
}>) {
  const reducedMotion = useReducedMotion();
  const [offset, setOffset] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const actionable = status.kind === 'pending';
  // Latest handlers for the native swipe listeners below.
  const latest = useRef({ actionable, onApprove, onReject });
  useEffect(() => {
    latest.current = { actionable, onApprove, onReject };
  });

  // Swipe accelerates the visible buttons. Native listeners keep the card a
  // plain article (no fake interactive role); buttons carry the keyboard path.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let start: { readonly x: number; readonly id: number } | null = null;
    const down = (event: globalThis.PointerEvent) => {
      if (!latest.current.actionable || !event.isPrimary) return;
      if (isControl(event.target)) return;
      start = { x: event.clientX, id: event.pointerId };
      card.setPointerCapture?.(event.pointerId);
    };
    const move = (event: globalThis.PointerEvent) => {
      if (start?.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      setOffset(latest.current.onReject ? dx : Math.max(0, dx));
    };
    const end = (commit: boolean) => (event: globalThis.PointerEvent) => {
      if (start?.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      start = null;
      setOffset(0);
      if (!commit) return;
      const { onApprove: approve, onReject: reject } = latest.current;
      if (dx >= DECISION_CARD_SWIPE_COMMIT_PX) approve();
      else if (dx <= -DECISION_CARD_SWIPE_COMMIT_PX && reject) reject();
    };
    const up = end(true);
    const cancel = end(false);
    card.addEventListener('pointerdown', down);
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
    card.addEventListener('pointercancel', cancel);
    return () => {
      card.removeEventListener('pointerdown', down);
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
      card.removeEventListener('pointercancel', cancel);
    };
  }, []);

  /** Arrow keys on either decision button: Right approves, Left rejects. */
  function onDecisionKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      !actionable ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onApprove();
    } else if (event.key === 'ArrowLeft' && onReject) {
      event.preventDefault();
      onReject();
    }
  }

  return (
    <article
      ref={cardRef}
      aria-label={view.decision}
      aria-busy={status.kind === 'submitting'}
      data-testid='decision-card'
      data-status={status.kind}
      className='flex touch-pan-y select-none flex-col gap-3'
      style={
        offset !== 0 && !reducedMotion
          ? { transform: `translateX(${offset}px)` }
          : undefined
      }
    >
      <div className='flex min-w-0 flex-col gap-1'>
        <h3 className='text-balance text-sm font-medium leading-5 text-primary-token'>
          {view.decision}
        </h3>
        {view.fallback ? (
          <DefaultLine fallback={view.fallback} />
        ) : view.waiting ? (
          <WaitingLine waiting={view.waiting} />
        ) : null}
      </div>

      {view.facts.length > 0 ? (
        <ul
          className='flex flex-col gap-1 text-xs leading-5 text-secondary-token'
          data-testid='decision-card-facts'
        >
          {view.facts.map(fact => (
            <li key={fact} className='line-clamp-2 text-pretty'>
              {fact}
            </li>
          ))}
        </ul>
      ) : null}

      {view.evidence.length > 0 ? (
        <ul
          className='flex flex-wrap gap-x-3 gap-y-1 text-xs text-tertiary-token'
          data-testid='decision-card-evidence'
        >
          {view.evidence.map(item => (
            <li key={item.href}>
              <a
                href={item.href}
                target='_blank'
                rel='noopener noreferrer'
                className='underline underline-offset-2 hover:text-primary-token'
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={cn(ACTION_SLOT, 'justify-between')}>
        <Button asChild variant='ghost' size='sm' className='-ml-2.5'>
          <Link href={discussHref} data-testid='decision-card-discuss'>
            Discuss
          </Link>
        </Button>
        <DecisionActions
          status={status}
          approveLabel={approveLabel}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
          onKeyDown={onDecisionKey}
        />
      </div>
    </article>
  );
}

function DecisionActions({
  status,
  approveLabel,
  onApprove,
  onReject,
  onRetry,
  onKeyDown,
}: Readonly<{
  readonly status: DecisionCardStatus;
  readonly approveLabel: string;
  readonly onApprove: () => void;
  readonly onReject?: () => void;
  readonly onRetry?: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}>) {
  if (status.kind === 'decided') {
    return (
      <p
        role='status'
        className='text-xs font-medium text-secondary-token'
        data-testid='decision-card-outcome'
      >
        {DECIDED_LABEL[status.decision][status.by]}
      </p>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className={ACTION_SLOT}>
        <p
          role='alert'
          className='truncate text-xs text-error'
          data-testid='decision-card-error'
        >
          {status.message}
        </p>
        {onRetry ? (
          <Button type='button' variant='secondary' size='sm' onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  const busy = status.kind === 'submitting';
  return (
    <div className={ACTION_SLOT}>
      {onReject ? (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={busy}
          onClick={onReject}
          onKeyDown={onKeyDown}
          aria-keyshortcuts='ArrowRight ArrowLeft'
          data-testid='decision-card-reject'
        >
          Reject
        </Button>
      ) : null}
      <Button
        type='button'
        variant='primary'
        size='sm'
        disabled={busy}
        onClick={onApprove}
        onKeyDown={onKeyDown}
        aria-keyshortcuts={onReject ? 'ArrowRight ArrowLeft' : 'ArrowRight'}
        data-testid='decision-card-approve'
      >
        {approveLabel}
      </Button>
    </div>
  );
}
