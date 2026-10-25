'use client';

import { useState } from 'react';

/**
 * Restorable canvas history (Tim, 2026-10-20 Q3): each turn is a canvas
 * state. A new turn jumps to the latest state; Back and Forward step through
 * earlier ones; Home returns to the plain company loop without losing them.
 */
export function useCanvasHistory(turnCount: number, live = false) {
  // Restored chat history must not hijack Home: Tim reopened Ovie to a card
  // reading just "hi" (19 of 19). Start on Home; a NEW turn jumps to itself.
  const [cursor, setCursor] = useState<number | 'home' | null>(
    turnCount > 0 && !live ? 'home' : null
  );
  const [seenCount, setSeenCount] = useState(turnCount);
  if (turnCount !== seenCount) {
    setSeenCount(turnCount);
    setCursor(null);
  }
  const index =
    turnCount === 0 || cursor === 'home'
      ? -1
      : Math.min(cursor ?? turnCount - 1, turnCount - 1);
  return {
    index,
    back: () => setCursor(Math.max(0, index - 1)),
    forward: () => setCursor(index + 1 >= turnCount - 1 ? null : index + 1),
    home: () => setCursor('home'),
  } as const;
}
