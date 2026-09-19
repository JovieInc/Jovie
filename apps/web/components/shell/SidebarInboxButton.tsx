'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { InboxNavigationAvailability } from '@/lib/inbox/navigation-availability';
import { useRuntimeUpdate } from './RuntimeUpdateProvider';
import { Tooltip } from './Tooltip';

/** Pending work is server-derived; opening the Inbox never resolves it. */
export function SidebarInboxButton({
  availability,
}: {
  readonly availability?: InboxNavigationAvailability;
}) {
  const update = useRuntimeUpdate();
  const pending =
    availability?.state === 'available' || Boolean(update?.available);
  const label = pending
    ? update?.available
      ? 'Inbox — App Update Available'
      : `Inbox — ${availability?.pendingCount} Items Need Attention`
    : availability?.state === 'empty'
      ? 'Inbox — All Caught Up'
      : 'Inbox — Status Unavailable';
  return (
    <Tooltip label={label} side='bottom'>
      <Link
        href={APP_ROUTES.DASHBOARD}
        aria-label={label}
        data-inbox-attention={
          pending ? 'available' : (availability?.state ?? 'unknown')
        }
        className='focus-ring-themed relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-item-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent'
      >
        <Bell className='size-3.5' aria-hidden='true' />
        {pending ? (
          <span
            aria-hidden='true'
            className='absolute right-1 top-1 size-1.5 rounded-full bg-accent'
          />
        ) : null}
      </Link>
    </Tooltip>
  );
}
