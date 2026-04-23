'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';

const loadModal = () =>
  import('./MarketingSignInModal').then(m => ({
    default: m.MarketingSignInModal,
  }));

const MarketingSignInModal = dynamic(loadModal, { ssr: false });

/**
 * Marketing-header sign-in trigger. The home route group is deliberately
 * static (no ClerkProvider in the layout tree) so the landing page stays
 * cacheable. We lazy-mount a scoped Clerk modal only when the visitor
 * actually clicks the link, preserving the static build path.
 *
 * We prefetch the modal chunk + the Clerk bundle on first hover/focus so
 * the click-to-open delay is near-zero and the skeleton rarely flashes.
 */
export function MarketingSignInLink() {
  const [open, setOpen] = useState(false);
  const prefetchedRef = useRef(false);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);
  const prefetch = useCallback(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    void loadModal();
  }, []);

  return (
    <>
      <button
        type='button'
        onClick={onOpen}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
        className='focus-ring-themed text-[13px] text-white/60 transition-colors duration-150 hover:text-white/90'
      >
        Sign in
      </button>
      {open ? <MarketingSignInModal onClose={onClose} /> : null}
    </>
  );
}
