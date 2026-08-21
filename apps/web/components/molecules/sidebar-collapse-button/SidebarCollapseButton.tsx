'use client';

import { RailToggleButton } from '@/components/atoms/RailToggleButton';
import { SIDEBAR_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useSidebarKeyboardShortcut';

interface SidebarCollapseButtonProps {
  readonly className?: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}

export function SidebarCollapseButton({
  className,
  open,
  onToggle,
}: SidebarCollapseButtonProps) {
  return (
    <RailToggleButton
      side='left'
      open={open}
      openLabel='Collapse sidebar'
      closedLabel='Expand sidebar'
      onToggle={onToggle}
      shortcut={SIDEBAR_KEYBOARD_SHORTCUT_BARE}
      className={className}
      dataTestId='sidebar-rail-toggle'
      iconTestId='sidebar-rail-toggle-icon'
    />
  );
}
