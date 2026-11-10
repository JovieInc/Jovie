'use client';

import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { useSidebar } from '@/components/shell/SidebarContext';
import { SIDEBAR_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useSidebarKeyboardShortcut';

interface SidebarCollapseButtonProps {
  readonly className?: string;
  /** In-content instances opt out so a peek cannot cover the control the
   * pointer is on (the flyout would swap it for the sidebar header). */
  readonly previewTrigger?: boolean;
}

export function SidebarCollapseButton({
  className,
  previewTrigger,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state, isPreview, open: pinned } = useSidebar();
  const isCollapsed = state === 'closed';

  return (
    <RailToggleButton
      side='left'
      controlsId='shell-left-rail'
      open={!isCollapsed}
      previewTrigger={previewTrigger}
      // Pinned open, the control collapses the rail, so it shows the rail
      // panel glyph (Pen canonical) rather than a crossed-out pin. Only the
      // floating peek offers to pin.
      iconOverride={isPreview ? 'Pin' : undefined}
      pinned={pinned}
      openLabel={isPreview ? 'Pin sidebar' : 'Collapse sidebar'}
      closedLabel='Expand sidebar'
      onToggle={toggleSidebar}
      shortcut={SIDEBAR_KEYBOARD_SHORTCUT_BARE}
      className={className}
      dataTestId='sidebar-rail-toggle'
      iconTestId='sidebar-rail-toggle-icon'
    />
  );
}
