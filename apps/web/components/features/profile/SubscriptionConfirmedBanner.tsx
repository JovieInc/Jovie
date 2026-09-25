'use client';

import { useEffect, useState } from 'react';
import { Banner } from '@/components/feedback/Banner';

/**
 * Shows a success banner when the user arrives via the email confirmation link.
 * Reads `?subscribed=confirmed` from the URL and auto-dismisses after 8 seconds.
 *
 * Rendered out of flow (absolute overlay over the profile content column) so
 * appearing and auto-dismissing never shift the profile layout — the fan's
 * post-subscribe visit renders once, unperturbed (JOV-6454). Mirrors the
 * BannerViewport idiom: a pointer-events-none shell with a pointer-events-auto
 * card, inset to the column's own padding via CSS variables.
 */
export function SubscriptionConfirmedBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const subscribed =
      new URLSearchParams(globalThis.location.search).get('subscribed') ===
      'confirmed';
    if (subscribed) {
      setVisible(true);
      const timer = globalThis.setTimeout(() => setVisible(false), 8000);
      return () => globalThis.clearTimeout(timer);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      className='pointer-events-none absolute inset-x-0 top-0 z-30 px-(--page-pad)'
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      data-testid='subscription-confirmed-banner-viewport'
    >
      <Banner
        variant='success'
        title='Notifications on!'
        description="You'll receive updates from this artist."
        onDismiss={() => setVisible(false)}
        className='pointer-events-auto'
        testId='subscription-confirmed-banner'
      />
    </div>
  );
}
