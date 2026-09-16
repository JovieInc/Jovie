'use client';

// @coverage-via apps/web/components/shell/OverlayInteractionGuard.test.tsx

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { restoreLeakedOverlayLocks } from '@/lib/a11y/overlay-interaction-lock';

/** Restores leaked overlay locks after menu/dialog/rail/route transitions. */
export function OverlayInteractionGuard() {
  const pathname = usePathname();

  useEffect(() => {
    restoreLeakedOverlayLocks();
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = globalThis.requestAnimationFrame(() => {
        frame = 0;
        restoreLeakedOverlayLocks();
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style'],
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['inert', 'aria-hidden', 'data-state', 'style'],
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      schedule();
    };

    document.addEventListener('keydown', onKeyDown);
    globalThis.addEventListener('popstate', schedule);
    schedule();

    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      globalThis.removeEventListener('popstate', schedule);
      if (frame) globalThis.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <span data-testid='overlay-interaction-guard' hidden aria-hidden='true' />
  );
}
