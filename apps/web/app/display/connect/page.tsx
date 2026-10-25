'use client';

import { useEffect, useState } from 'react';
import { parseProofFragment } from '@/lib/ovie/display/proof-fragment';

/** A proof is good for 60s: retry a store blip inside that window, then give up. */
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

/**
 * Sign-in for the office display. The proof arrives in the URL fragment (never
 * sent to a server or written to access logs); this page strips it from the
 * address bar and history, POSTs it, and moves on to /display. A 503 or a
 * network error (the session store blipped) is retried with backoff while the
 * proof is still valid; a 401 or 429 is final.
 */
export default function DisplayConnectPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const proof = parseProofFragment(globalThis.location.hash);
    globalThis.history.replaceState(null, '', globalThis.location.pathname);
    if (!proof) {
      setFailed(true);
      return;
    }
    let cancelled = false;
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
        if (response.status !== 503) throw new Error('denied');
      } catch (error) {
        if ((error as Error).message === 'denied') {
          if (!cancelled) setFailed(true);
          return;
        }
      }
      const delay = RETRY_DELAYS_MS[index];
      if (delay === undefined) {
        if (!cancelled) setFailed(true);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      if (!cancelled) await attempt(index + 1);
    };
    void attempt(0);
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <main className='flex min-h-screen items-center justify-center bg-base text-secondary-token'>
      {failed ? 'This display could not be connected.' : 'Connecting display'}
    </main>
  );
}
