'use client';

import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { useSidebar } from '@/components/organisms/Sidebar';
import { SIDEBAR_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useSidebarKeyboardShortcut';

interface SidebarCollapseButtonProps {
  readonly className?: string;
}

export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === 'closed';

  return (
    <RailToggleButton
      side='left'
      open={!isCollapsed}
      openLabel='Collapse sidebar'
      closedLabel='Expand sidebar'
      onToggle={toggleSidebar}
      shortcut={SIDEBAR_KEYBOARD_SHORTCUT_BARE}
      className={className}
      dataTestId='sidebar-rail-toggle'
      iconTestId='sidebar-rail-toggle-icon'
    />
  );
}
