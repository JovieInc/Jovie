'use client';

import type { Virtualizer } from '@tanstack/react-virtual';
import { type RefObject, useCallback, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { deriveThreadTurns } from './derive-thread-turns';
import type { ChatNavMessage, ThreadTurn } from './types';

/** Matches `VIRTUALIZATION_THRESHOLD` in `JovieChat` — rail only helps long threads. */
export const THREAD_NAV_RAIL_MIN_MESSAGES = 13;

export const THREAD_NAV_RAIL_MIN_TURNS = 2;

interface ChatThreadNavigationRailProps {
  readonly messages: readonly ChatNavMessage[];
  readonly scrollContainerRef: RefObject<HTMLDivElement | null>;
  readonly shouldVirtualizeMessages: boolean;
  readonly virtualizer: Virtualizer<HTMLDivElement, Element>;
}

function markerTopPercent(messageIndex: number, messageCount: number): number {
  if (messageCount <= 1) {
    return 0;
  }

  return (messageIndex / (messageCount - 1)) * 100;
}

export function ChatThreadNavigationRail({
  messages,
  scrollContainerRef,
  shouldVirtualizeMessages,
  virtualizer,
}: ChatThreadNavigationRailProps) {
  const turns = useMemo(() => deriveThreadTurns(messages), [messages]);
  const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null);

  const jumpToTurn = useCallback(
    (turn: ThreadTurn) => {
      if (shouldVirtualizeMessages) {
        virtualizer.scrollToIndex(turn.messageIndex, {
          align: 'start',
          behavior: 'smooth',
        });
        return;
      }

      const scrollContainer = scrollContainerRef.current;
      const target = scrollContainer?.querySelector(
        `[data-index="${turn.messageIndex}"]`
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [scrollContainerRef, shouldVirtualizeMessages, virtualizer]
  );

  if (
    messages.length < THREAD_NAV_RAIL_MIN_MESSAGES ||
    turns.length < THREAD_NAV_RAIL_MIN_TURNS
  ) {
    return null;
  }

  return (
    <div
      className='system-b-chat-thread-nav-hover-zone'
      data-testid='chat-thread-navigation-hover-zone'
    >
      <div
        className='system-b-chat-thread-nav-gutter'
        aria-hidden='true'
        data-testid='chat-thread-navigation-gutter'
      />
      <nav
        aria-label='Thread Turns'
        className='system-b-chat-thread-navigation-rail'
        data-testid='chat-thread-navigation-rail'
      >
        {turns.map(turn => {
          const isHovered = hoveredTurnId === turn.id;
          return (
            <button
              key={`${turn.id}:${turn.messageIndex}`}
              type='button'
              className={cn(
                'system-b-chat-thread-nav-marker',
                isHovered && 'is-hovered'
              )}
              style={{
                top: `${markerTopPercent(turn.messageIndex, messages.length)}%`,
              }}
              onMouseEnter={() => setHoveredTurnId(turn.id)}
              onMouseLeave={() => setHoveredTurnId(null)}
              onFocus={() => setHoveredTurnId(turn.id)}
              onBlur={() => setHoveredTurnId(null)}
              onClick={() => jumpToTurn(turn)}
              aria-label={`Jump to turn ${turn.turnNumber}: ${turn.preview}`}
            >
              {isHovered ? (
                <span className='system-b-chat-thread-nav-preview'>
                  <span className='system-b-chat-thread-nav-preview-label'>
                    Turn {turn.turnNumber}
                  </span>
                  <span className='system-b-chat-thread-nav-preview-text'>
                    {turn.preview}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
