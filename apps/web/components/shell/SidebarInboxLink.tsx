'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type MouseEvent, type PointerEvent, useContext } from 'react';
import { INBOX_NAVIGATION_ITEM_ID } from '@/components/features/dashboard/dashboard-nav/navigation-state';
import { usePendingNavigation } from '@/components/features/dashboard/dashboard-nav/use-pending-navigation';
import { APP_ROUTES } from '@/constants/routes';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import {
  formatInboxPendingWorkLabel,
  type InboxNavigationAvailability,
} from '@/lib/inbox/navigation-availability';
import {
  navigationInputMethodFromClick,
  startNavigationTelemetry,
} from '@/lib/tracking/navigation-telemetry';
import { SidebarContext } from './SidebarContext';
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
 * updates are announced by the shell's update pill, not on the bell. The bell
 * is the main way into the Inbox, so it reports the same navigation telemetry
 * the rail's Inbox row did.
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
    ? `Inbox — ${formatInboxPendingWorkLabel(pendingCount)}`
    : availability?.state === 'empty'
      ? 'Inbox — all caught up'
      : 'Inbox';

  const handlePointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (!isPlainPrimaryClick(event) || inboxIsCurrent) return;
    beginPendingNavigation(INBOX_NAVIGATION_ITEM_ID);
  };

  const isMobile = useContext(SidebarContext)?.isMobile ?? false;
  const isElectron = useIsElectronRuntime();
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainPrimaryClick(event)) {
      cancelPendingNavigation(INBOX_NAVIGATION_ITEM_ID);
      return;
    }
    startNavigationTelemetry({
      itemId: INBOX_NAVIGATION_ITEM_ID,
      sourcePathname: `${pathname}${globalThis.location?.search ?? ''}`,
      destinationHref: APP_ROUTES.DASHBOARD,
      inputMethod: navigationInputMethodFromClick(event.detail),
      context: {
        isElectron,
        isMobile,
        navVariant: 'canonical_identity_work_v1',
      },
    });
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
