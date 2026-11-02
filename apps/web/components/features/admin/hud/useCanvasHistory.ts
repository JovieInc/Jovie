'use client';

import { useState } from 'react';

/**
 * Restorable canvas history (Tim, 2026-10-20 Q3): each turn is a canvas
 * state. A new turn jumps to the latest state; Back and Forward step through
 * earlier ones; Home returns to the plain company loop without losing them.
 */
export function useCanvasHistory(turnCount: number) {
  // Opening Home shows the company loop, not whatever the last conversation
  // ended on (Tim 2026-10-30: a stale failed tool reply sat on Home as
  // "20 of 20"). Turns from earlier sessions stay one Back away.
  const [cursor, setCursor] = useState<number | 'home' | null>(
    turnCount > 0 ? 'home' : null
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
    back: () => setCursor(index < 0 ? turnCount - 1 : Math.max(0, index - 1)),
    forward: () => setCursor(index + 1 >= turnCount - 1 ? null : index + 1),
    home: () => setCursor('home'),
  } as const;
}
