'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
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

/**
 * Pending work is server-derived; opening the Inbox never resolves it. App
 * updates are announced by the shell's update pill, not on the bell.
 */
export function SidebarInboxLink({
  availability,
}: {
  readonly availability?: InboxNavigationAvailability;
}) {
  const pendingCount = availability?.pendingCount;
  const pending =
    availability?.state === 'available' &&
    typeof pendingCount === 'number' &&
    pendingCount > 0;
  const label = pending
    ? `Inbox — ${formatInboxPendingWorkLabel(pendingCount)}`
    : availability?.state === 'empty'
      ? 'Inbox — all caught up'
      : 'Inbox';
  return (
    <Tooltip label={label} side='bottom'>
      <Link
        href={APP_ROUTES.DASHBOARD}
        prefetch={false}
        aria-label={label}
        data-inbox-attention={
          pending
            ? 'available'
            : availability?.state === 'empty'
              ? 'empty'
              : 'unknown'
        }
        className={SIDEBAR_HEADER_ICON_BUTTON_CLASS}
      >
        <Bell className={SIDEBAR_HEADER_ICON_CLASS} aria-hidden='true' />
        {pending ? (
          <span
            data-inbox-count='true'
            aria-hidden='true'
            className='absolute -right-0.5 -top-0.5 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-accent tabular-nums text-(length:--app-shell-sidebar-badge-font-size) font-bold text-(--color-bg-base)'
          >
            {Math.min(pendingCount, 99)}
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}
