'use client';

import { useEffect, useState } from 'react';
import { parseProofFragment } from '@/lib/ovie/display/proof-fragment';

/**
 * Sign-in for the office display. The proof arrives in the URL fragment (never
 * sent to a server or written to access logs); this page strips it from the
 * address bar and history, POSTs it, and moves on to /display.
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
    void fetch('/api/ovie/display/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof),
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(response => {
        if (!response.ok) throw new Error('denied');
        globalThis.location.replace('/display');
      })
      .catch(() => setFailed(true));
  }, []);
  return (
    <main className='flex min-h-screen items-center justify-center bg-base text-secondary-token'>
      {failed ? 'This display could not be connected.' : 'Connecting display'}
    </main>
  );
}
