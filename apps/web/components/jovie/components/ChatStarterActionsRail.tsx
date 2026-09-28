'use client';

import { Button, IconButton } from '@jovie/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { CHAT_STARTER_ACTIONS } from '../starter-actions';
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
      setActiveIndex(current => Math.max(current - 1, 0));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveIndex(current => Math.min(current + 1, lastIndex));
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
      className='group/carousel relative mx-auto w-full max-w-md'
      data-testid='chat-starter-actions-rail'
    >
      <fieldset
        aria-roledescription='slide'
        aria-label={`${boundedIndex + 1} of ${cards.length}: ${activeCard.title}`}
        className='m-0 min-w-0 border-0 p-0'
      >
        <ChatActionCard
          title={activeCard.title}
          icon={CHAT_STARTER_ACTIONS[activeCard.id].icon}
          body={activeCard.body}
          actionLabel={activeCard.actionLabel}
          ariaLabel={activeCard.title}
          onAct={() => onAct(activeCard)}
          onDismiss={() => onDismiss(activeCard)}
        />
      </fieldset>
      <div
        className={cn(
          'absolute -left-12 top-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-subtle sm:block',
          boundedIndex === 0
            ? ''
            : 'group-hover/carousel:opacity-100 focus-within:opacity-100'
        )}
      >
        <IconButton
          variant='secondary'
          size='md'
          ariaLabel='Show Previous Starter Action'
          disabled={boundedIndex === 0}
          onClick={() => setActiveIndex(current => Math.max(current - 1, 0))}
        >
          <ChevronLeft strokeWidth={2.75} aria-hidden='true' />
        </IconButton>
      </div>
      <div
        className={cn(
          'absolute -right-12 top-20 hidden -translate-y-1/2 opacity-0 transition-opacity duration-subtle sm:block',
          boundedIndex === lastIndex
            ? ''
            : 'group-hover/carousel:opacity-100 focus-within:opacity-100'
        )}
      >
        <IconButton
          variant='secondary'
          size='md'
          ariaLabel='Show Next Starter Action'
          disabled={boundedIndex === lastIndex}
          onClick={() =>
            setActiveIndex(current => Math.min(current + 1, lastIndex))
          }
        >
          <ChevronRight strokeWidth={2.75} aria-hidden='true' />
        </IconButton>
      </div>
      {cards.length > 1 ? (
        <>
          <div className='mt-2 flex min-h-11 items-center justify-between gap-3 sm:hidden'>
            <span
              className='text-xs tabular-nums text-tertiary-token'
              aria-live='polite'
            >
              {boundedIndex + 1} of {cards.length}
            </span>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              aria-label='Show More Starter Actions'
              onClick={() =>
                setActiveIndex(current =>
                  current >= lastIndex ? 0 : current + 1
                )
              }
            >
              More
              <ChevronRight className='size-4' aria-hidden='true' />
            </Button>
          </div>
          <fieldset className='mt-2 hidden min-h-5 items-center justify-center border-0 p-0 sm:flex'>
            <legend className='sr-only'>Choose Starter Action</legend>
            {visiblePaginationIndexes.map(index => (
              <IconButton
                key={cards[index]?.id ?? index}
                variant='ghost'
                size='md'
                aria-label={`Show Starter Action ${index + 1} Of ${cards.length}: ${cards[index]?.title ?? ''}`}
                aria-current={index === boundedIndex ? 'true' : undefined}
                onClick={() => setActiveIndex(index)}
                onKeyDown={handlePaginationKeyDown}
                className='group'
              >
                <span
                  className={cn(
                    'size-1 rounded-full transition duration-subtle motion-reduce:transition-none',
                    index === boundedIndex
                      ? 'scale-125 bg-secondary-token'
                      : 'bg-quaternary-token/65 group-hover:bg-tertiary-token'
                  )}
                  aria-hidden='true'
                />
              </IconButton>
            ))}
            <span className='sr-only' aria-live='polite'>
              Starter Action {boundedIndex + 1} Of {cards.length}
            </span>
          </fieldset>
        </>
      ) : null}
    </section>
  );
}
