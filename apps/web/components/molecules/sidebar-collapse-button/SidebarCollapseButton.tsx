'use client';

import { IconButton } from '@jovie/ui';
import { Icon } from '@/components/atoms/Icon';
import {
  RAIL_TOGGLE_BUTTON_CLASS,
  RailToggleButton,
} from '@/components/atoms/RailToggleButton';
import { railIconName } from '@/components/atoms/rail-icons';
import { useSidebar } from '@/components/shell/SidebarContext';
import { SIDEBAR_KEYBOARD_SHORTCUT_BARE } from '@/hooks/useSidebarKeyboardShortcut';
import { cn } from '@/lib/utils';

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
  const {
    toggleSidebar,
    state,
    isPreview,
    open: pinned,
    isMobile,
    openMobile,
  } = useSidebar();
  const isCollapsed = state === 'closed';

  if (isMobile) {
    return (
      <IconButton
        type='button'
        variant='ghost'
        size='sm'
        aria-label={openMobile ? 'Close sidebar' : 'Open sidebar'}
        aria-controls='shell-left-rail'
        aria-expanded={openMobile}
        onClick={toggleSidebar}
        data-testid='sidebar-rail-toggle'
        data-rail-toggle='left'
        data-rail-preview-trigger='false'
        className={cn(RAIL_TOGGLE_BUTTON_CLASS, className)}
      >
        <Icon
          name={openMobile ? 'X' : railIconName('left', false)}
          className='size-3.5'
          strokeWidth={2}
          aria-hidden='true'
          data-testid='sidebar-rail-toggle-icon'
        />
      </IconButton>
    );
  }

  return (
    <RailToggleButton
      side='left'
      controlsId='shell-left-rail'
      open={!isCollapsed}
      previewTrigger={previewTrigger}
      iconOverride={isPreview ? 'Pin' : pinned ? 'PinOff' : undefined}
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
