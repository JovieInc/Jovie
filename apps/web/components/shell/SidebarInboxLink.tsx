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
  // A badge is earned only by a real pending count. 'empty' and the
  // fail-open 'unknown' state render no badge at all (shell-ia.md: chrome
  // recedes), and a downloaded-but-unapplied update alone is a quiet dot,
  // not the count treatment.
  const pendingCount =
    availability?.state === 'available' ? (availability.pendingCount ?? 0) : 0;
  const pending = pendingCount > 0;
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
        {pending ? (
          // The canonical count treatment (matches InboxAttentionLink, the
          // non-header bell) — a real number, never a bare status disc.
          <span
            role='status'
            aria-label={`${pendingCount} pending items`}
            className='absolute -right-0.5 -top-0.5 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-accent tabular-nums text-(length:--app-shell-sidebar-badge-font-size) font-bold text-(--color-bg-base)'
          >
            {Math.min(pendingCount, 99)}
          </span>
        ) : hasRuntimeUpdate ? (
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
