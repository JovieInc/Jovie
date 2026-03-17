'use client';

import { useEffect, useRef } from 'react';

interface ShopRedirectClientProps {
  readonly redirectUrl: string;
  readonly username: string;
}

export function ShopRedirectClient({
  redirectUrl,
  username,
}: ShopRedirectClientProps) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    // Fire tracking beacon before redirect
    // Uses /api/track which requires: handle, linkType, target
    try {
      const payload = JSON.stringify({
        handle: username,
        linkType: 'other',
        target: redirectUrl,
        context: {
          provider: 'shopify',
        },
      });

      // sendBeacon with a plain string sends text/plain, but /api/track
      // calls request.json() which needs application/json. Use a Blob.
      const blob = new Blob([payload], { type: 'application/json' });

      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', blob);
      } else {
        fetch('/api/track', {
          method: 'POST',
          body: payload,
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {
          // Fire-and-forget — don't block redirect
        });
      }
    } catch {
      // Tracking failure should never block the redirect
    }

    // Redirect after a small delay to let the beacon fire
    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 50);
  }, [redirectUrl, username]);

  return (
    <div className='flex items-center justify-center min-h-screen'>
      <div className='text-center'>
        <div className='animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-4' />
        <p className='text-gray-600 dark:text-gray-400'>Redirecting to shop…</p>
      </div>
    </div>
  );
}
