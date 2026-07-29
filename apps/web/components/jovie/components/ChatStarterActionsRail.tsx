'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import type { ChatActionCard as ChatActionCardModel } from '../types';
import { ChatActionCard } from './ChatActionCard';

interface ChatStarterActionsRailProps {
  readonly cards: readonly ChatActionCardModel[];
  readonly onAct: (card: ChatActionCardModel) => void;
  readonly onDismiss: (card: ChatActionCardModel) => void;
}

const MAX_VISIBLE_PAGINATION_DOTS = 3;

function getVisiblePaginationIndexes(
  activeIndex: number,
  cardCount: number
): number[] {
  const visibleCount = Math.min(cardCount, MAX_VISIBLE_PAGINATION_DOTS);
  const maxStart = Math.max(cardCount - visibleCount, 0);
  const centeredStart = activeIndex - Math.floor(visibleCount / 2);
  const start = Math.min(Math.max(centeredStart, 0), maxStart);
  return Array.from({ length: visibleCount }, (_, offset) => start + offset);
}

export function ChatStarterActionsRail({
  cards,
  onAct,
  onDismiss,
}: ChatStarterActionsRailProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const lastIndex = Math.max(cards.length - 1, 0);
  const boundedIndex = Math.min(activeIndex, lastIndex);
  const activeCard = cards[boundedIndex];
  const visiblePaginationIndexes = getVisiblePaginationIndexes(
    boundedIndex,
    cards.length
  );

  useEffect(() => {
    setActiveIndex(current => Math.min(current, lastIndex));
  }, [lastIndex]);

  if (!activeCard) return null;

  const handlePaginationKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setActiveIndex(current => (current <= 0 ? lastIndex : current - 1));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveIndex(current => (current >= lastIndex ? 0 : current + 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(lastIndex);
    }
  };

  return (
    <section
      aria-label='Starter Actions'
      aria-roledescription='carousel'
      className='group/carousel relative mx-auto w-full max-w-[28rem]'
      data-testid='chat-starter-actions-rail'
    >
      <fieldset
        aria-roledescription='slide'
        aria-label={`${boundedIndex + 1} of ${cards.length}: ${activeCard.title}`}
        className='m-0 min-w-0 border-0 p-0'
      >
        <ChatActionCard
          title={activeCard.title}
          body={activeCard.body}
          actionLabel={activeCard.actionLabel}
          ariaLabel={activeCard.title}
          onAct={() => onAct(activeCard)}
          onDismiss={() => onDismiss(activeCard)}
        />
      </fieldset>
      {boundedIndex > 0 ? (
        <button
          type='button'
          aria-label='Show Previous Starter Action'
          onClick={() => setActiveIndex(current => current - 1)}
          className='absolute -left-12 top-20 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-secondary-token opacity-0 transition-[opacity,transform,color] duration-subtle ease-out group-hover/carousel:opacity-100 hover:text-primary-token focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none sm:grid'
        >
          <ChevronLeft
            className='size-7'
            strokeWidth={2.75}
            aria-hidden='true'
          />
        </button>
      ) : null}
      {boundedIndex < lastIndex ? (
        <button
          type='button'
          aria-label='Show Next Starter Action'
          onClick={() => setActiveIndex(current => current + 1)}
          className='absolute -right-12 top-20 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-secondary-token opacity-0 transition-[opacity,transform,color] duration-subtle ease-out group-hover/carousel:opacity-100 hover:text-primary-token focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none sm:grid'
        >
          <ChevronRight
            className='size-7'
            strokeWidth={2.75}
            aria-hidden='true'
          />
        </button>
      ) : null}
      {cards.length > 1 ? (
        <fieldset className='mt-2 flex min-h-5 items-center justify-center border-0 p-0'>
          <legend className='sr-only'>Choose Starter Action</legend>
          {visiblePaginationIndexes.map(index => (
            <button
              key={cards[index]?.id ?? index}
              type='button'
              aria-label={`Show Starter Action ${index + 1} Of ${cards.length}: ${cards[index]?.title ?? ''}`}
              aria-current={index === boundedIndex ? 'true' : undefined}
              onClick={() => setActiveIndex(index)}
              onKeyDown={handlePaginationKeyDown}
              className='group relative grid size-8 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0'
            >
              <span
                className='size-1 rounded-full bg-quaternary-token/65 transition-[transform,background-color] duration-subtle group-hover:bg-tertiary-token group-aria-[current=true]:scale-125 group-aria-[current=true]:bg-secondary-token motion-reduce:transition-none'
                aria-hidden='true'
              />
            </button>
          ))}
          <span className='sr-only' aria-live='polite'>
            Starter Action {boundedIndex + 1} Of {cards.length}
          </span>
        </fieldset>
      ) : null}
    </section>
  );
}
