'use client';

import { useEffect, useState } from 'react';

/**
 * The one chat-home state machine, shared by Ovie Home and Jovie's chat home
 * (Tim, 2026-10-25: "both should use the same central logic, just different
 * content"). Three states:
 *
 * - `home`: the home surface (Ovie's HUD, Jovie's suggestion and wins) shows.
 * - `composing`: the user has started typing; the surface fades out and comes
 *   back if the composer is emptied before sending.
 * - `thread`: a conversation owns the view.
 *
 * Apps pass content only; the transitions, the Esc and Back To Home rules, and
 * the reduced-motion behavior live here and in `ChatHomeSurface`.
 */
export type ChatHomeState = 'home' | 'composing' | 'thread';

export function resolveChatHomeState(
  showThread: boolean,
  composing: boolean
): ChatHomeState {
  if (showThread) return 'thread';
  return composing ? 'composing' : 'home';
}

/** Calm and quick; `motion-reduce` removes the animation, never the state change. */
export const CHAT_HOME_SWAP_CLASSNAME =
  'animate-in fade-in-0 duration-fast ease-subtle motion-reduce:animate-none';
export const CHAT_HOME_FADE_CLASSNAME =
  'transition-opacity duration-fast ease-subtle motion-reduce:transition-none';

interface DraftStore {
  getSnapshot: () => string;
}

/**
 * Thread-or-home ownership. A `returnable` home (Ovie) opens on the surface
 * even when a conversation exists, the first message replaces it with the
 * thread, and Back To Home or Esc on an empty composer returns. A
 * non-returnable home (Jovie) shows the thread whenever there is one; leaving
 * it is a new chat.
 */
export function useChatHomeState({
  hasThread,
  returnable,
  chatActive,
  draft,
}: {
  readonly hasThread: boolean;
  readonly returnable: boolean;
  /** A message is being sent or a reply is streaming. */
  readonly chatActive: boolean;
  readonly draft: DraftStore;
}) {
  const [homeOpen, setHomeOpen] = useState(true);
  const showThreadView = hasThread && (!returnable || !homeOpen);

  useEffect(() => {
    if (returnable && chatActive) setHomeOpen(false);
  }, [returnable, chatActive]);

  useEffect(() => {
    if (!returnable || !showThreadView || chatActive) return;
    // Capture phase and stopImmediatePropagation: on a thread Esc means "back
    // to home" before it means "leave Full Screen".
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A typed draft keeps Esc for itself: only an empty composer goes home.
      if (draft.getSnapshot().trim()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setHomeOpen(true);
    };
    globalThis.addEventListener('keydown', onKey, true);
    return () => globalThis.removeEventListener('keydown', onKey, true);
  }, [returnable, showThreadView, chatActive, draft]);

  return {
    showThreadView,
    goHome: () => setHomeOpen(true),
    openThread: () => setHomeOpen(false),
  } as const;
}
