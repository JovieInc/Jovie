'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { APP_ROUTES } from '@/constants/routes';
import type { InboxNavigationAvailability } from '@/lib/inbox/navigation-availability';
import { useRuntimeUpdate } from './RuntimeUpdateProvider';
import { Tooltip } from './Tooltip';

/** Pending work is server-derived; opening the Inbox never resolves it. */
export function SidebarInboxLink({
  availability,
}: {
  readonly availability?: InboxNavigationAvailability;
}) {
  const hasRuntimeUpdate = Boolean(useRuntimeUpdate()?.available);
  const pending = availability?.state === 'available';
  const label = pending
    ? `Inbox — ${availability?.pendingCount} items need attention`
    : availability?.state === 'empty'
      ? 'Inbox — all caught up'
      : 'Inbox';
  const accessibleLabel = hasRuntimeUpdate
    ? `${label}; app update available`
    : label;
  return (
    <Tooltip label={accessibleLabel} side='bottom'>
      <Link
        href={APP_ROUTES.DASHBOARD}
        prefetch={false}
        aria-label={accessibleLabel}
        data-inbox-attention={
          pending ? 'available' : (availability?.state ?? 'unknown')
        }
        className='focus-ring-themed relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-item-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent'
      >
        <Bell
          className='size-(--app-shell-sidebar-icon-size)'
          aria-hidden='true'
        />
        {pending || hasRuntimeUpdate ? (
          <span
            data-runtime-update={hasRuntimeUpdate || undefined}
            aria-hidden='true'
            className='absolute bottom-1 right-1 size-1.5 rounded-full bg-accent'
          />
        ) : null}
      </Link>
    </Tooltip>
  );
}
