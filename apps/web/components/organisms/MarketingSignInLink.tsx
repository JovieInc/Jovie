'use client';

import { Button } from '@jovie/ui';
import dynamic from 'next/dynamic';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const loadModal = () =>
  import('./AuthModal').then(m => ({
    default: m.AuthModal,
  }));

const AuthModal = dynamic(loadModal, { ssr: false });

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

  if (variant === 'pill') {
    return (
      <>
        <Button
          variant='whitePill'
          onClick={onOpen}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          onTouchStart={prefetch}
          className='focus-ring-themed h-[36px] px-4 sm:h-[40px] sm:px-5 sm:text-[14px]'
        >
          Sign in
        </Button>
        {open ? <AuthModal onClose={onClose} defaultMode='signin' /> : null}
      </>
    );
  }

  return (
    <>
      <button
        type='button'
        onClick={onOpen}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
        className={cn(
          'focus-ring-themed transition-colors duration-subtle',
          'text-[13px] text-white/60 hover:text-white/90'
        )}
      >
        Sign in
      </button>
      {open ? <AuthModal onClose={onClose} defaultMode='signin' /> : null}
    </>
  );
}
