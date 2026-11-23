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
/** A real update waits this long before it shows, so a burst reads as one. */
export const SIDEBAR_O_UPDATE_REVEAL_MS = SIDEBAR_O_UPDATING_DELAY_MS;
/** An update stays at least this long before a newer one replaces it. */
export const SIDEBAR_O_UPDATE_MIN_MS = SIDEBAR_O_UPDATING_MIN_MS;
/** An update holds this long after it shows, then fades. */
export const SIDEBAR_O_SYNCED_HOLD_MS = 2400;

export interface SidebarOUpdate {
  readonly id: number;
  readonly label: string;
  readonly href?: string | undefined;
}

export interface SidebarOPresenceProps {
  /** True only while the desktop updater is checking or downloading. */
  readonly updating?: boolean;
  /** Main chat page; the O navigates here. No panel, no popover. */
  readonly href?: string;
  readonly variant?: BrandVariant;
  /** A real change that landed (from `useOUpdates`). Shown as a link. */
  readonly update?: SidebarOUpdate | null;
  /** Called once the update has faded, so the next change starts clean. */
  readonly onUpdateDone?: () => void;
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
  update = null,
  onUpdateDone,
}: SidebarOPresenceProps) {
  const [revealed, setRevealed] = useState(false);
  const revealedAt = useRef(0);
  const { painted, visible: updateVisible } = useUpdateReveal(
    update,
    onUpdateDone
  );
  const showUpdate = updateVisible && !revealed;
  const slotVisible = revealed || showUpdate;

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
        data-state={slotVisible ? 'visible' : 'hidden'}
        className='sidebar-o-status flex h-4 min-w-0 flex-1 items-center gap-1.5 truncate text-2xs text-sidebar-muted'
      >
        {/* Both labels stay painted while fading so the slot never reflows. */}
        <span
          aria-hidden='true'
          hidden={!revealed}
          className='flex items-center gap-1.5'
        >
          <span className='size-1 shrink-0 rounded-full bg-primary' />
          <span className='truncate'>Updating</span>
        </span>
        <Link
          href={painted?.href ?? href}
          prefetch={false}
          data-sidebar-o-update=''
          hidden={revealed}
          tabIndex={showUpdate ? undefined : -1}
          aria-hidden={showUpdate ? undefined : true}
          className='flex min-w-0 items-center gap-1.5 truncate rounded-sm text-sidebar-muted outline-none hover:text-primary-token focus-visible:text-primary-token focus-visible:underline'
        >
          <span className='size-1 shrink-0 rounded-full bg-primary' />
          <span className='truncate'>{painted?.label ?? ''}</span>
        </Link>
        <span role='status' aria-live='polite' className='sr-only'>
          {revealed
            ? 'Updating'
            : showUpdate && painted
              ? `Updated: ${painted.label}`
              : ''}
        </span>
      </span>
    </div>
  );
}

/**
 * Reveal a real update: wait the reveal delay, show, hold, then fade. A newer
 * update replaces the text once the current one has shown its minimum, and
 * restarts the hold. The text it paints survives the fade.
 */
function useUpdateReveal(
  update: SidebarOUpdate | null,
  onDone: (() => void) | undefined
) {
  const [painted, setPainted] = useState<SidebarOUpdate | null>(null);
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const done = useRef(onDone);
  const latest = useRef(update);
  const visibleRef = useRef(false);
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    done.current = onDone;
    latest.current = update;
    visibleRef.current = visible;
  });
  const id = update?.id;

  useEffect(() => {
    const next = latest.current;
    if (id === undefined || !next) return;
    const delay = visibleRef.current
      ? Math.max(0, SIDEBAR_O_UPDATE_MIN_MS - (Date.now() - shownAt.current))
      : SIDEBAR_O_UPDATE_REVEAL_MS;
    const show = setTimeout(() => {
      shownAt.current = Date.now();
      setPainted(next);
      setVisible(true);
      // Each paint restarts the hold; the hold outlives a cleared update so
      // a shown line always fades instead of sticking.
      if (hold.current) clearTimeout(hold.current);
      hold.current = setTimeout(() => {
        hold.current = undefined;
        setVisible(false);
        done.current?.();
      }, SIDEBAR_O_SYNCED_HOLD_MS);
    }, delay);
    return () => clearTimeout(show);
  }, [id]);

  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    []
  );

  return { painted, visible };
}
