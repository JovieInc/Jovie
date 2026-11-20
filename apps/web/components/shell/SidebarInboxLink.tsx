'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { MouseEvent, PointerEvent } from 'react';
import { INBOX_NAVIGATION_ITEM_ID } from '@/components/features/dashboard/dashboard-nav/navigation-state';
import { usePendingNavigation } from '@/components/features/dashboard/dashboard-nav/use-pending-navigation';
import { APP_ROUTES } from '@/constants/routes';
import {
  formatInboxPendingWorkLabel,
  type InboxNavigationAvailability,
} from '@/lib/inbox/navigation-availability';
import {
  SIDEBAR_HEADER_ICON_BUTTON_CLASS,
  SIDEBAR_HEADER_ICON_CLASS,
} from './sidebar-header-icon-button';
import { Tooltip } from './Tooltip';

function normalizeNavigationPathname(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
}

function isPlainPrimaryClick(
  event: Pick<
    MouseEvent<HTMLAnchorElement>,
    'altKey' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'
  >
): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Pending work is server-derived; opening the Inbox never resolves it. App
 * updates are announced by the shell's update pill, not on the bell.
 */
export function SidebarInboxLink({
  availability,
}: {
  readonly availability?: InboxNavigationAvailability;
}) {
  const pathname = normalizeNavigationPathname(usePathname() ?? '');
  const { pendingNavigation, beginPendingNavigation, cancelPendingNavigation } =
    usePendingNavigation(pathname);
  const navigationPending =
    pendingNavigation?.itemId === INBOX_NAVIGATION_ITEM_ID;
  const inboxIsCurrent = pathname === APP_ROUTES.DASHBOARD;
  const pendingCount = availability?.pendingCount;
  const pending =
    availability?.state === 'available' && typeof pendingCount === 'number';
  const label = pending
    ? `Home — ${formatInboxPendingWorkLabel(pendingCount)}`
    : availability?.state === 'empty'
      ? 'Home — all caught up'
      : 'Home';

  const handlePointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (!isPlainPrimaryClick(event) || inboxIsCurrent) return;
    beginPendingNavigation(INBOX_NAVIGATION_ITEM_ID);
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainPrimaryClick(event)) {
      cancelPendingNavigation(INBOX_NAVIGATION_ITEM_ID);
    }
  };

  return (
    <Tooltip label={label} side='bottom'>
      <Link
        href={APP_ROUTES.DASHBOARD}
        prefetch={false}
        aria-label={label}
        aria-busy={navigationPending || undefined}
        data-navigation-item-id={INBOX_NAVIGATION_ITEM_ID}
        data-navigation-pending={navigationPending || undefined}
        data-inbox-attention={
          pending
            ? 'available'
            : availability?.state === 'empty'
              ? 'empty'
              : 'unknown'
        }
        className={SIDEBAR_HEADER_ICON_BUTTON_CLASS}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <Bell className={SIDEBAR_HEADER_ICON_CLASS} aria-hidden='true' />
        {pending ? (
          <span
            data-inbox-unread='true'
            aria-hidden='true'
            className='absolute bottom-1 right-1 size-1.5 rounded-full bg-accent'
          />
        ) : null}
      </Link>
    </Tooltip>
  );
}
