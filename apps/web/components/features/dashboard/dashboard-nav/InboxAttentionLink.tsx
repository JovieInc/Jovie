'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

export interface InboxAttentionLinkProps {
  /** Accessible name, including any update notice. */
  readonly label: string;
  readonly itemId: string;
  readonly attention: string;
  readonly pendingCount?: number;
  readonly runtimeUpdate?: boolean;
  readonly navigationPending?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** The rail's Inbox bell, used when the header does not own the inbox. */
export function InboxAttentionLink({
  label,
  itemId,
  attention,
  pendingCount = 0,
  runtimeUpdate = false,
  navigationPending = false,
  onClick,
}: InboxAttentionLinkProps) {
  return (
    <Link
      href={APP_ROUTES.DASHBOARD}
      onClick={onClick}
      prefetch={false}
      aria-busy={navigationPending || undefined}
      aria-label={label}
      data-inbox-attention={attention}
      data-navigation-item-id={itemId}
      data-navigation-pending={navigationPending || undefined}
      className={cn(
        'relative flex size-7 shrink-0 items-center justify-center rounded-full text-secondary-token transition-colors duration-subtle ease-subtle hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-2 after:lg:hidden',
        navigationPending && 'bg-sidebar-accent-active text-primary-token'
      )}
    >
      <Bell
        className='size-(--app-shell-sidebar-icon-size)'
        aria-hidden='true'
      />
      {pendingCount > 0 ? (
        <span
          role='status'
          aria-label={`${pendingCount} pending items`}
          className='absolute -right-0.5 -top-0.5 flex min-w-3.5 h-3.5 items-center justify-center rounded-full bg-accent text-(length:--app-shell-sidebar-badge-font-size) font-bold text-(--color-bg-base)'
        >
          {Math.min(pendingCount, 99)}
        </span>
      ) : runtimeUpdate ? (
        <span
          aria-hidden='true'
          data-inbox-runtime-update
          className='absolute right-0 top-0 size-1.5 rounded-full bg-accent'
        />
      ) : null}
    </Link>
  );
}
