'use client';

import { Button } from '@jovie/ui';
import { ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { type KeyboardEvent, type RefObject, useCallback, useRef } from 'react';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import {
  FounderReviewRecorder,
  type FounderReviewRecorderHandle,
} from './FounderReviewRecorder';

export interface FounderReviewStackProps {
  readonly cards: readonly (OpportunityInboxCardViewModel & {
    readonly sourceKind: string;
  })[];
  readonly onApprove: (id: string) => void | Promise<void>;
  readonly onReject: (id: string) => void | Promise<void>;
  readonly onOpen?: (id: string) => void;
  readonly pendingActionId?: string | null;
  readonly keyboardControlRef?: RefObject<HTMLButtonElement | null>;
}

export function FounderReviewStack({
  cards,
  onApprove,
  onReject,
  onOpen,
  pendingActionId = null,
  keyboardControlRef,
}: FounderReviewStackProps) {
  const card = cards[0] ?? null;
  const recorderRef = useRef<FounderReviewRecorderHandle>(null);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        event.repeat ||
        event.target !== event.currentTarget
      ) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        recorderRef.current?.approve();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        recorderRef.current?.reject();
      }
    },
    []
  );
  if (!card) return null;

  return (
    <section
      aria-label='Founder Opportunity Review'
      data-testid='founder-review-stack'
    >
      <Button
        type='button'
        ref={keyboardControlRef}
        variant='ghost'
        size='sm'
        className='sr-only focus-visible:absolute focus-visible:top-0 focus-visible:left-0 focus-visible:z-20 focus-visible:not-sr-only'
        onClick={() => onOpen?.(card.id)}
        onKeyDown={handleKeyDown}
      >
        Review Current Opportunity
      </Button>
      <div className='mb-3 flex items-center justify-between gap-3 text-xs text-tertiary-token'>
        <span>Founder Queue</span>
        <span aria-live='polite'>1 of {cards.length}</span>
      </div>
      <article
        className='overflow-hidden rounded-lg border border-subtle bg-surface-0 shadow-sm'
        data-testid={`founder-review-card-${card.id}`}
        aria-busy={pendingActionId === card.id}
      >
        <div className='relative flex aspect-[16/8] min-h-52 items-center justify-center overflow-hidden border-b border-subtle bg-surface-1'>
          {card.visual ? (
            <Image
              src={card.visual.url}
              alt={card.visual.alt}
              fill
              unoptimized
              sizes='(max-width: 768px) 100vw, 720px'
              className='object-contain'
            />
          ) : (
            <div className='flex max-w-xs flex-col items-center gap-3 px-6 text-center text-tertiary-token'>
              <ImageIcon aria-hidden='true' className='size-8 stroke-1' />
              <span className='text-xs'>Source visual not available</span>
            </div>
          )}
        </div>
        <div className='p-5 sm:p-6'>
          <div className='flex min-h-5 items-center justify-between gap-3 text-2xs font-medium text-tertiary-token'>
            <span>{card.typeLabel}</span>
            <span>{card.sourceKind.replaceAll(/[._]/g, ' ')}</span>
          </div>
          <h2 className='mt-2 truncate text-xl font-semibold tracking-tight text-primary-token sm:text-2xl'>
            {card.title}
          </h2>
          <p className='mt-2 line-clamp-3 min-h-18 text-sm leading-6 text-secondary-token'>
            {card.why}
          </p>
          <FounderReviewRecorder
            ref={recorderRef}
            target={{
              type: 'inbox-card',
              id: card.id,
              title: card.title,
              sourceKind: card.sourceKind,
              category: card.category,
            }}
            onApprove={() => onApprove(card.id)}
            onReject={() => onReject(card.id)}
          />
        </div>
      </article>
    </section>
  );
}
