'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';

const MarketingSignInModal = dynamic(
  () =>
    import('./MarketingSignInModal').then(m => ({
      default: m.MarketingSignInModal,
    })),
  { ssr: false }
);

/**
 * Marketing-header sign-in trigger. The home route group is deliberately
 * static (no ClerkProvider in the layout tree) so the landing page stays
 * cacheable. We lazy-mount a scoped Clerk modal only when the visitor
 * actually clicks the link, preserving the static build path.
 */
export function MarketingSignInLink() {
  const [open, setOpen] = useState(false);
  const onOpen = useCallback(() => setOpen(true), []);
  const onClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type='button'
        onClick={onOpen}
        className='focus-ring-themed text-[13px] text-white/60 transition-colors duration-150 hover:text-white/90'
      >
        Sign in
      </button>
      {open ? <MarketingSignInModal onClose={onClose} /> : null}
    </>
  );
}
