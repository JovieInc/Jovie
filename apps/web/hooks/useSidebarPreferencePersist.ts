'use client';

import { useCallback, useEffect, useRef, useTransition } from 'react';

/**
 * Trailing wait before the sidebar preference is written to the database.
 * Longer than the rail motion, so a burst of toggles settles into one write
 * that starts after the rail has stopped moving.
 */
export const SIDEBAR_PERSIST_DEBOUNCE_MS = 500;

type PersistSidebarCollapsed = (collapsed: boolean) => Promise<void>;

/**
 * Coalesces sidebar toggles into one background persist of the final state.
 *
 * The `sidebar:state` cookie (written synchronously by
 * `useSidebarCookieState`) is the source of truth for SSR. The database row
 * is only the fallback for a browser without the cookie, so it can lag: a
 * burst of toggles sends the last value once, and a burst that ends on the
 * value already stored sends nothing.
 *
 * Returns `undefined` when there is no persist function so the sidebar
 * provider keeps managing its own state.
 */
export function useSidebarPreferencePersist(
  persist: PersistSidebarCollapsed | undefined
): ((open: boolean) => void) | undefined {
  const [, startTransition] = useTransition();
  const persistRef = useRef(persist);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCollapsedRef = useRef<boolean | null>(null);
  const storedCollapsedRef = useRef<boolean | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // The cookie already holds the final state; a write that has not
      // started yet is dropped with the shell instead of racing a sign-out.
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      pendingCollapsedRef.current = null;
    };
  }, []);

  const flush = useCallback(() => {
    timerRef.current = null;
    // Keep the latest requested state until the current write finishes. A
    // completed older value cannot tell us what an in-flight write will save.
    if (savingRef.current || !mountedRef.current) return;
    if (pendingCollapsedRef.current === null) return;

    savingRef.current = true;
    startTransition(() => {
      // Fire-and-forget: an offline or failed save must not disturb the shell.
      void (async () => {
        try {
          // A pending debounce keeps its full wait. If it already expired,
          // drain only the latest value after the preceding write completes.
          while (
            mountedRef.current &&
            timerRef.current === null &&
            pendingCollapsedRef.current !== null
          ) {
            const collapsed = pendingCollapsedRef.current;
            pendingCollapsedRef.current = null;
            const run = persistRef.current;
            if (!run || storedCollapsedRef.current === collapsed) continue;
            try {
              await run(collapsed);
              storedCollapsedRef.current = collapsed;
            } catch {
              storedCollapsedRef.current = null;
            }
          }
        } finally {
          savingRef.current = false;
        }
      })();
    });
  }, [startTransition]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      pendingCollapsedRef.current = !open;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, SIDEBAR_PERSIST_DEBOUNCE_MS);
    },
    [flush]
  );

  return persist ? handleOpenChange : undefined;
}
