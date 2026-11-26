'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/** CSS variable the thread scroll padding adds to its base inset. */
export const CHAT_COMPOSER_DOCK_EXTRA_VAR = '--chat-composer-dock-extra';

/**
 * Hosts a caller-provided card directly above the composer. In the floating
 * thread dock the card grows the dock upward, so the slot publishes its height
 * on the workspace and the transcript's bottom inset grows with it: the card
 * never covers the last message. A ResizeObserver writes the variable straight
 * to the DOM, so the chat tree does not re-render.
 */
export function ChatComposerDockSlot({
  children,
  measure = false,
}: Readonly<{ children: ReactNode; measure?: boolean }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    const workspace = node?.closest<HTMLElement>(
      '[data-testid="chat-workspace"]'
    );
    if (!measure || !node || !workspace) return;
    const publish = () =>
      workspace.style.setProperty(
        CHAT_COMPOSER_DOCK_EXTRA_VAR,
        `${node.offsetHeight}px`
      );
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      workspace.style.removeProperty(CHAT_COMPOSER_DOCK_EXTRA_VAR);
    };
  }, [measure]);
  return (
    <div ref={ref} className='flow-root' data-testid='chat-composer-dock-slot'>
      {children}
    </div>
  );
}
