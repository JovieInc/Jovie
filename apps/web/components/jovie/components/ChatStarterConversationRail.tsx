'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import {
  type ChatStarterConversation,
  takeNextStarterConversationIndex,
} from '@/lib/chat/new-chat-entry-contract';
import { ChatStarterConversationCard } from './ChatStarterConversationCard';

interface ChatStarterConversationRailProps {
  readonly samples: readonly ChatStarterConversation[];
  readonly onSelect: (sample: ChatStarterConversation) => void;
}

const MAX_VISIBLE_PAGINATION_DOTS = 3;

function getVisiblePaginationIndexes(
  activeIndex: number,
  sampleCount: number
): number[] {
  const visibleCount = Math.min(sampleCount, MAX_VISIBLE_PAGINATION_DOTS);
  const maxStart = Math.max(sampleCount - visibleCount, 0);
  const centeredStart = activeIndex - Math.floor(visibleCount / 2);
  const start = Math.min(Math.max(centeredStart, 0), maxStart);
  return Array.from({ length: visibleCount }, (_, offset) => start + offset);
}

export function ChatStarterConversationRail({
  samples,
  onSelect,
}: ChatStarterConversationRailProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    takeNextStarterConversationIndex()
  );
  const lastIndex = Math.max(samples.length - 1, 0);
  const boundedIndex = Math.min(activeIndex, lastIndex);
  const activeSample = samples[boundedIndex];
  const visiblePaginationIndexes = getVisiblePaginationIndexes(
    boundedIndex,
    samples.length
  );

  useEffect(() => {
    setActiveIndex(current => Math.min(current, lastIndex));
  }, [lastIndex]);

  if (!activeSample) return null;

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
      aria-label='Sample Conversations'
      aria-roledescription='carousel'
      className='group/carousel relative w-full'
      data-chat-grid-anchor='starter'
      data-testid='chat-starter-conversation-rail'
    >
      <fieldset
        aria-roledescription='slide'
        aria-label={`${boundedIndex + 1} of ${samples.length}: ${activeSample.userPrompt}`}
        className='m-0 min-w-0 border-0 p-0'
      >
        <ChatStarterConversationCard
          sample={activeSample}
          onSelect={onSelect}
        />
      </fieldset>
      <button
        type='button'
        aria-label='Show Previous Sample Conversation'
        disabled={boundedIndex === 0}
        onClick={() => setActiveIndex(current => Math.max(current - 1, 0))}
        className='absolute -left-11 top-1/2 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-secondary-token opacity-0 transition-[opacity,color] duration-subtle group-hover/carousel:opacity-100 hover:text-primary-token focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-0 motion-reduce:transition-none sm:grid'
      >
        <ChevronLeft className='size-6' strokeWidth={2.5} aria-hidden='true' />
      </button>
      <button
        type='button'
        aria-label='Show Next Sample Conversation'
        disabled={boundedIndex === lastIndex}
        onClick={() =>
          setActiveIndex(current => Math.min(current + 1, lastIndex))
        }
        className='absolute -right-11 top-1/2 hidden size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-secondary-token opacity-0 transition-[opacity,color] duration-subtle group-hover/carousel:opacity-100 hover:text-primary-token focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-0 motion-reduce:transition-none sm:grid'
      >
        <ChevronRight className='size-6' strokeWidth={2.5} aria-hidden='true' />
      </button>
      {samples.length > 1 ? (
        <>
          <div className='mt-1 flex min-h-11 items-center justify-between gap-3 sm:hidden'>
            <span
              className='text-xs tabular-nums text-tertiary-token'
              aria-live='polite'
            >
              {boundedIndex + 1} of {samples.length}
            </span>
            <button
              type='button'
              aria-label='Show Next Sample Conversation'
              onClick={() =>
                setActiveIndex(current =>
                  current >= lastIndex ? 0 : current + 1
                )
              }
              className='inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-secondary-token transition-[background-color,color] duration-subtle hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 motion-reduce:transition-none'
            >
              Next
              <ChevronRight className='size-4' aria-hidden='true' />
            </button>
          </div>
          <fieldset className='mt-1 hidden min-h-8 items-center justify-center border-0 p-0 sm:flex'>
            <legend className='sr-only'>Choose Sample Conversation</legend>
            {visiblePaginationIndexes.map(index => (
              <button
                key={samples[index]?.id ?? index}
                type='button'
                aria-label={`Show Sample Conversation ${index + 1} Of ${samples.length}: ${samples[index]?.userPrompt ?? ''}`}
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
              Sample Conversation {boundedIndex + 1} Of {samples.length}
            </span>
          </fieldset>
        </>
      ) : null}
    </section>
  );
}
