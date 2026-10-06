'use client';

import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { useSidebar } from '@/components/organisms/sidebar';
import { SIDEBAR_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useSidebarKeyboardShortcut';

interface SidebarCollapseButtonProps {
  readonly className?: string;
}

export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state, isPreview, open: pinned } = useSidebar();
  const isCollapsed = state === 'closed';

  return (
    <RailToggleButton
      side='left'
      controlsId='shell-left-rail'
      open={!isCollapsed}
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
