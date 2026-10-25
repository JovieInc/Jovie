'use client';

import { useEffect, useState } from 'react';
import { parseProofFragment } from '@/lib/ovie/display/proof-fragment';

/** A proof is good for 60s: retry a store blip inside that window, then give up. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

export function DisplayConnectView({ failed }: Readonly<{ failed: boolean }>) {
  return (
    <main className='flex min-h-screen items-center justify-center bg-base text-secondary-token'>
      {failed ? 'This display could not be connected.' : 'Connecting display'}
    </main>
  );
}

/**
 * Sign-in for the office display. The proof arrives in the URL fragment (never
 * sent to a server or written to access logs); this strips it from the address
 * bar and history, POSTs it, and moves on to /display. A 503 or a network error
 * (the session store blipped) is retried with backoff while the proof is still
 * valid. Any other failure falls back to /display, which shows Home if this
 * browser already holds a valid display session and "not authorized" if not:
 * a re-connect with a spent or stale proof never knocks a working wall over.
 */
export function DisplayConnect() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const proof = parseProofFragment(globalThis.location.hash);
    globalThis.history.replaceState(null, '', globalThis.location.pathname);
    let cancelled = false;
    const fallBack = () => {
      if (cancelled) return;
      setFailed(true);
      globalThis.location.replace('/display');
    };
    if (!proof) {
      fallBack();
      return;
    }
    const attempt = async (index: number): Promise<void> => {
      try {
        const response = await fetch('/api/ovie/display/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proof),
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (response.ok) {
          globalThis.location.replace('/display');
          return;
        }
        if (response.status !== 503) return fallBack();
      } catch {
        // Network error: treated like a store blip.
      }
      const delay = RETRY_DELAYS_MS[index];
      if (delay === undefined) return fallBack();
      await new Promise(resolve => setTimeout(resolve, delay));
      if (!cancelled) await attempt(index + 1);
    };
    void attempt(0);
    return () => {
      cancelled = true;
    };
  }, []);
  return <DisplayConnectView failed={failed} />;
}
