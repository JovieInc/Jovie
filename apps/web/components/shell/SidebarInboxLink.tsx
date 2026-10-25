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
  // JOV-8968: the count in the bell label comes straight from the shared
  // Inbox availability source; singular/plural copy must match it (JOV-9018).
  const pendingCount = availability?.pendingCount ?? 0;
  const needsAttentionLabel =
    pendingCount === 1
      ? '1 Item Needs Attention'
      : `${pendingCount} Items Need Attention`;
  const label = pending
    ? `Inbox — ${needsAttentionLabel}`
    : availability?.state === 'empty'
      ? 'Inbox — All Caught Up'
      : 'Inbox — Status Unavailable';
  const accessibleLabel = hasRuntimeUpdate
    ? `${label}; App Update Available`
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
