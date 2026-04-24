'use client';

import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

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
export function MarketingSignInLink({
  variant = 'ghost',
}: Readonly<{
  readonly variant?: 'ghost' | 'pill';
}>) {
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
        className={cn(
          'focus-ring-themed transition-all duration-150',
          variant === 'pill'
            ? 'inline-flex h-[42px] items-center justify-center rounded-full border border-white/90 bg-white px-5 text-[14px] font-medium tracking-[-0.012em] text-black shadow-[0_12px_30px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.72)] hover:-translate-y-[0.5px] hover:bg-white/94 active:translate-y-0'
            : 'text-[13px] text-white/60 hover:text-white/90'
        )}
      >
        Sign in
      </button>
      {open ? <MarketingSignInModal onClose={onClose} /> : null}
    </>
  );
}
