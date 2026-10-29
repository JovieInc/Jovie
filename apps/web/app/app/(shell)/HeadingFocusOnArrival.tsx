'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { focusMainHeading } from '@/lib/a11y/focus-main-heading';

/**
 * Consumes the `focus=heading` arrival marker (JOV-9035). A checkout success
 * moment navigates to the unlocked feature with this marker; on arrival the
 * feature's main h1 receives focus (never `body`, never an unmounted node).
 * The marker is stripped from the URL after it is consumed so refreshes and
 * shares never re-trigger focus.
 */
export function HeadingFocusOnArrival() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasFocusMarker = searchParams.get('focus') === 'heading';

  useEffect(() => {
    if (!hasFocusMarker) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled) return;
      focusMainHeading();
      const remaining = new URLSearchParams(searchParams);
      remaining.delete('focus');
      const query = remaining.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [hasFocusMarker, pathname, router, searchParams]);

  return null;
}
