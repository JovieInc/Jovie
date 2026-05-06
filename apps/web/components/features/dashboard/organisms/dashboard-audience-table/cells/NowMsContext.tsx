'use client';

import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Stable timestamp for relative-time and state-derivation cells.
 *
 * The SSR pass renders with a deterministic constant so the server-rendered
 * HTML matches the client's first paint (no hydration mismatch). After mount,
 * a `useEffect` writes the real `Date.now()`, causing exactly one re-render.
 *
 * Exposed via context so cells can subscribe without making the column defs
 * time-dependent (which would force TanStack Table to rebuild its model).
 */

// Constant chosen so SSR-rendered rows fall into the "rising" bucket for
// medium-intent fans — visually neutral until the post-mount value arrives.
const SSR_NOW_MS = 0;

const NowMsContext = createContext<number>(SSR_NOW_MS);

export function NowMsProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [nowMs, setNowMs] = useState<number>(SSR_NOW_MS);
  useEffect(() => {
    setNowMs(Date.now());
    // Refresh the timestamp every minute so dormant boundaries shift over
    // long-lived sessions without a full reload.
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return (
    <NowMsContext.Provider value={nowMs}>{children}</NowMsContext.Provider>
  );
}

export function useNowMs(): number {
  return useContext(NowMsContext);
}

export function isSsrNowMs(value: number): boolean {
  return value === SSR_NOW_MS;
}
