'use client';

import { Button, Kbd } from '@jovie/ui';
import { ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/molecules/Avatar';
import type { ListMember } from '@/lib/ovie/lists/model';
import type { ListCreator } from '@/lib/ovie/lists/types';
import type { ClientListAction } from '@/lib/queries/useOvieListsQuery';
import { creatorDisplayName, creatorFacts } from './CreatorSourcingRow';
import { StarRating } from './StarRating';

export type TriageDecision = 'pass' | 'add' | 'favorite' | { rating: number };

/** Map one triage decision to the label-producing list actions. */
export function triageActions(
  creatorId: string,
  decision: TriageDecision
): ClientListAction[] {
  if (decision === 'pass') {
    return [{ type: 'swipe', creatorId, direction: 'left' }];
  }
  const accept: ClientListAction = {
    type: 'swipe',
    creatorId,
    direction: 'right',
  };
  if (decision === 'add') return [accept];
  if (decision === 'favorite') {
    return [accept, { type: 'favorite', creatorId, favorite: true }];
  }
  return [accept, { type: 'rate', creatorId, rating: decision.rating }];
}

/** Keyboard map, scoped to the focused deck. Returns null for other keys. */
export function decisionForKey(key: string): TriageDecision | null {
  if (key === 'ArrowLeft') return 'pass';
  if (key === 'ArrowRight') return 'add';
  if (key === 'ArrowUp') return 'favorite';
  if (/^[1-5]$/.test(key)) return { rating: Number(key) };
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

export interface TriageDeckProps {
  readonly suggestions: readonly ListMember[];
  readonly creatorsById: ReadonlyMap<string, ListCreator>;
  readonly busy: boolean;
  readonly onDecide: (actions: ClientListAction[]) => void;
}

/**
 * One suggestion at a time. Arrow keys and 1-5 accelerate the visible
 * Pass / Favorite / Add buttons and star rating; they never replace them.
 */
export function TriageDeck({
  suggestions,
  creatorsById,
  busy,
  onDecide,
}: TriageDeckProps) {
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [total] = useState(() => suggestions.length);
  const current = suggestions.find(m => !decided.has(m.creatorId));

  const decide = (decision: TriageDecision) => {
    if (busy || !current) return;
    setDecided(previous => new Set(previous).add(current.creatorId));
    onDecide(triageActions(current.creatorId, decision));
  };
  const decideRef = useRef(decide);
  useEffect(() => {
    decideRef.current = decide;
  });

  // Shortcuts live only while the deck is mounted and never fire from a
  // text field or with modifiers, so typing and browser shortcuts win.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const decision = decisionForKey(event.key);
      if (!decision) return;
      event.preventDefault();
      decideRef.current(decision);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!current) {
    return (
      <p className='px-4 py-10 text-center text-app text-secondary-token'>
        All suggestions decided. Use Suggest More to keep training this list.
      </p>
    );
  }

  const creator = creatorsById.get(current.creatorId);
  const name = creatorDisplayName(creator);

  return (
    <section
      aria-label={`Triage suggestions: ${name}`}
      aria-keyshortcuts='ArrowLeft ArrowRight ArrowUp 1 2 3 4 5'
      className='mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-8 text-center'
      data-testid='triage-deck'
    >
      <p className='text-xs tabular-nums text-tertiary-token'>
        {Math.min(decided.size + 1, total)} of {total}
      </p>
      <Avatar
        src={creator?.avatarUrl ?? null}
        alt=''
        name={name}
        size='2xl'
        shape='person'
        verified={Boolean(creator?.isVerified)}
      />
      <div className='min-w-0'>
        <h2 className='truncate text-lg font-medium text-primary-token'>
          {name}
        </h2>
        <p className='truncate text-xs text-tertiary-token'>
          {creatorFacts(creator)}
        </p>
      </div>
      {current.suggestionReasons?.length ? (
        <ul
          aria-label='Why Jovie Suggested This Creator'
          className='space-y-0.5 text-xs text-secondary-token'
        >
          {current.suggestionReasons.map(reason => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      <StarRating
        value={null}
        label={`Add ${name} with a rating`}
        disabled={busy}
        onChange={rating => {
          if (rating !== null) decide({ rating });
        }}
      />
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          disabled={busy}
          onClick={() => decide('pass')}
        >
          <ArrowLeft aria-hidden='true' className='size-3.5' />
          Pass
        </Button>
        <Button
          variant='ghost'
          size='sm'
          disabled={busy}
          onClick={() => decide('favorite')}
        >
          <ArrowUp aria-hidden='true' className='size-3.5' />
          Favorite
        </Button>
        <Button
          variant='secondary'
          size='sm'
          disabled={busy}
          onClick={() => decide('add')}
        >
          Add
          <ArrowRight aria-hidden='true' className='size-3.5' />
        </Button>
      </div>
      <p className='text-xs text-quaternary-token'>
        <Kbd>←</Kbd> pass <Kbd>↑</Kbd> favorite <Kbd>→</Kbd> add <Kbd>1-5</Kbd>{' '}
        add with rating
      </p>
    </section>
  );
}
