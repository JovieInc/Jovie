'use client';

import { useEffect, useState } from 'react';
import { Banner } from '@/components/feedback/Banner';

/**
 * Shows a success banner when the user arrives via the email confirmation link.
 * Reads `?subscribed=confirmed` from the URL and auto-dismisses after 8 seconds.
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
    <div className='shrink-0 pb-3'>
      <Banner
        variant='success'
        title='Notifications on!'
        description="You'll receive updates from this artist."
        onDismiss={() => setVisible(false)}
        className='mb-4'
        testId='subscription-confirmed-banner'
      />
    </div>
  );
}
