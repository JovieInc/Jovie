'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import {
  formatInboxPendingWorkLabel,
  type InboxNavigationAvailability,
} from '@/lib/inbox/navigation-availability';
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
    availability?.state === 'available' && typeof pendingCount === 'number';
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
        className='focus-ring-themed relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-item-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent'
      >
        <Bell
          className='size-(--app-shell-sidebar-icon-size)'
          aria-hidden='true'
        />
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
