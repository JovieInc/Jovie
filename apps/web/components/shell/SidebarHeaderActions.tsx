'use client';

import { SidebarCollapseButton } from '@/components/molecules/sidebar-collapse-button';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import type { InboxNavigationAvailability } from '@/lib/inbox/navigation-availability';
import { cn } from '@/lib/utils';
import { HeaderSearchSurfaceFromContext } from './HeaderSearchSurfaceFromContext';
import { RailStagedContent } from './RailStagedContent';
import { SHELL_RAIL_TOGGLE_LEAD } from './rail-motion';
import { useSidebar } from './SidebarContext';
import { SidebarInboxLink } from './SidebarInboxLink';
import {
  SIDEBAR_HEADER_ACTIONS_GAP_CLASS,
  SIDEBAR_HEADER_ICON_BUTTON_CLASS,
  SIDEBAR_HEADER_ICON_CLASS,
  SIDEBAR_HEADER_TOGGLE_LEAD_CLASS,
} from './sidebar-header-icon-button';

/** Header copy of the rail toggle: same box, glyph and hit area as the bell. */
const HEADER_TOGGLE_CLASS = cn(
  SIDEBAR_HEADER_ICON_BUTTON_CLASS,
  'aria-pressed:text-sidebar-item-foreground [&_svg]:size-(--app-shell-sidebar-icon-size)'
);

export interface SidebarHeaderActionsProps {
  /** Bell + search render on customer routes, not route/operator/demo rails. */
  readonly showActions: boolean;
  readonly headerOwnsCollapsedToggle: boolean;
  readonly inboxNavigation?: InboxNavigationAvailability;
}

/**
 * Trailing controls of the sidebar brand row: Inbox bell, search and the
 * rail toggle. All three share one 28px icon-button contract and one gap,
 * stay centered on the 28px logo line, and stage out with the rail without
 * clipping their focus rings while expanded (Tim 2026-11-14).
 */
export function SidebarHeaderActions({
  showActions,
  headerOwnsCollapsedToggle,
  inboxNavigation,
}: SidebarHeaderActionsProps) {
  const isDesktop = useIsElectronRuntime();
  const { state, isMobile, isPreview, open: pinned } = useSidebar();
  const chromeHidden = state === 'closed' && !isMobile;

  return (
    <>
      {showActions ? (
        <RailStagedContent
          hidden={chromeHidden}
          className={cn(
            'flex shrink-0 items-center',
            SIDEBAR_HEADER_ACTIONS_GAP_CLASS
          )}
          data-sidebar-header-actions='true'
        >
          <SidebarInboxLink availability={inboxNavigation} />
          <HeaderSearchSurfaceFromContext compact />
        </RailStagedContent>
      ) : null}
      {isDesktop ? null : (
        <RailStagedContent
          hidden={
            !pinned && !isPreview && !isMobile && headerOwnsCollapsedToggle
          }
          stage={headerOwnsCollapsedToggle}
          data-sidebar-header-toggle-slot='true'
          className={cn(
            'flex shrink-0 items-center',
            SHELL_RAIL_TOGGLE_LEAD,
            SIDEBAR_HEADER_TOGGLE_LEAD_CLASS
          )}
        >
          <SidebarCollapseButton
            className={HEADER_TOGGLE_CLASS}
            iconClassName={SIDEBAR_HEADER_ICON_CLASS}
          />
        </RailStagedContent>
      )}
    </>
  );
}
