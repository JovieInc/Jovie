'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { displayRetryDelayMs } from '@/lib/ovie/display/retry';

/** The display's session store is unreachable: retry with backoff, never give up. */
export function DisplayRetry() {
  const router = useRouter();
  const attempt = useRef(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        attempt.current += 1;
        router.refresh();
        schedule();
      }, displayRetryDelayMs(attempt.current));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [router]);
  return (
    <main
      className='flex min-h-screen items-center justify-center bg-base text-secondary-token'
      role='status'
    >
      Reconnecting display
    </main>
  );
}
