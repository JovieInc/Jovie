'use client';

// @coverage-via apps/web/tests/unit/chat/ScrollToBottom.test.tsx

import './ScrollToBottom.css';

import { ArrowDown } from 'lucide-react';
import { useSyncExternalStore } from 'react';

interface ScrollToBottomProps {
  readonly visible: boolean;
  readonly onClick: () => void;
}

/**
 * Floating button that appears when the user scrolls up in the chat,
 * allowing them to quickly jump back to the latest messages.
 */
const STUCK_ON_SERVER = () => true;

/**
 * Follows stick-to-bottom without rendering the transcript owner.
 * The scroll ratchet counts a frame over 50ms as dropped; re-rendering the
 * message list when the sentinel crosses the fold is that frame.
 */
export function ChatStickScrollButton({
  subscribe,
  getSnapshot,
  onClick,
}: {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => boolean;
  readonly onClick: () => void;
}) {
  const stuck = useSyncExternalStore(subscribe, getSnapshot, STUCK_ON_SERVER);
  return <ScrollToBottom visible={!stuck} onClick={onClick} />;
}

export function ScrollToBottom({ visible, onClick }: ScrollToBottomProps) {
  if (!visible) return null;

  return (
    <button
      type='button'
      onClick={onClick}
      className='system-b-scroll-to-bottom'
      aria-label='Scroll To Latest Messages'
    >
      <span className='system-b-scroll-to-bottom-icon'>
        <ArrowDown className='h-3 w-3' />
      </span>
    </button>
  );
}
