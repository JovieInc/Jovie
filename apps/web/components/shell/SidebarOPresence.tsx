'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { APP_ROUTES } from '@/constants/routes';
import type { BrandVariant } from '@/lib/brand/tokens';
import { cn } from '@/lib/utils';
import './SidebarOPresence.css';

export const SIDEBAR_O_PRESENCE_TEST_ID = 'sidebar-o-presence';
export const SIDEBAR_O_STATUS_TEST_ID = 'sidebar-o-status';
/** A check that ends sooner than this never shows. */
export const SIDEBAR_O_UPDATING_DELAY_MS = 400;
/** Once revealed, the status stays at least this long so it never flickers. */
export const SIDEBAR_O_UPDATING_MIN_MS = 600;

export interface SidebarOPresenceProps {
  /** True only while the desktop updater is checking or downloading. */
  readonly updating?: boolean;
  /** Main chat page; the O navigates here. No panel, no popover. */
  readonly href?: string;
  readonly variant?: BrandVariant;
}

/**
 * The O: Ovie's presence, docked at the bottom edge of the sidebar. One
 * wrapper owns position so a later slice can morph it into a composer in
 * place. The status slot beside it is always laid out and changes by opacity
 * and transform only, so revealing it never shifts anything.
 */
export function SidebarOPresence({
  updating = false,
  href = APP_ROUTES.CHAT,
  variant = 'jovie',
}: SidebarOPresenceProps) {
  const [revealed, setRevealed] = useState(false);
  const revealedAt = useRef(0);

  useEffect(() => {
    if (updating) {
      if (revealed) return;
      const timer = setTimeout(() => {
        revealedAt.current = Date.now();
        setRevealed(true);
      }, SIDEBAR_O_UPDATING_DELAY_MS);
      return () => clearTimeout(timer);
    }
    if (!revealed) return;
    const remaining = Math.max(
      0,
      SIDEBAR_O_UPDATING_MIN_MS - (Date.now() - revealedAt.current)
    );
    const timer = setTimeout(() => setRevealed(false), remaining);
    return () => clearTimeout(timer);
  }, [updating, revealed]);

  return (
    <div
      data-sidebar-o-presence=''
      data-testid={SIDEBAR_O_PRESENCE_TEST_ID}
      data-updating={revealed ? 'true' : undefined}
      // Perspective room: a later slice flips the O into artwork in place.
      style={{ perspective: '600px' }}
      className='flex h-8 shrink-0 items-center gap-2 px-(--app-shell-sidebar-inset) py-1'
    >
      <Link
        href={href}
        prefetch={false}
        aria-label='Open Chat'
        data-sidebar-o-button=''
        className={cn(
          'relative flex size-7 shrink-0 items-center justify-center rounded-full outline-none',
          'text-primary-token transition-colors duration-fast ease-interactive',
          'hover:bg-sidebar-accent focus-visible:bg-sidebar-accent',
          revealed && 'ring-1 ring-primary/50'
        )}
      >
        <BrandLogo
          size='chrome'
          tone='auto'
          variant={variant}
          rounded
          aria-hidden
        />
      </Link>
      <span
        data-testid={SIDEBAR_O_STATUS_TEST_ID}
        data-state={revealed ? 'visible' : 'hidden'}
        className='sidebar-o-status flex h-4 min-w-0 flex-1 items-center gap-1.5 truncate text-2xs text-sidebar-muted'
      >
        {/* The label stays painted while fading out so the slot never reflows. */}
        <span aria-hidden='true' className='flex items-center gap-1.5'>
          <span className='size-1 shrink-0 rounded-full bg-primary' />
          <span className='truncate'>Updating</span>
        </span>
        <span role='status' aria-live='polite' className='sr-only'>
          {revealed ? 'Updating' : ''}
        </span>
      </span>
    </div>
  );
}
