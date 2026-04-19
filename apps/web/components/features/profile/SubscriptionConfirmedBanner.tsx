'use client';

import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    <output
      aria-live='polite'
      className='block w-full px-4 py-3 mb-4 rounded-xl bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 text-sm text-center animate-in fade-in slide-in-from-top-2 duration-slower'
    >
      <span className='inline-flex items-center gap-2'>
        <Bell className='w-4 h-4' aria-hidden='true' />
        <span className='font-medium'>
          Notifications on! You&apos;ll receive updates from this artist.
        </span>
      </span>
    </output>
  );
}
