'use client';

import { TooltipShortcut } from '@jovie/ui';
import { PanelLeft } from 'lucide-react';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
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
  const label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const shortcut = SIDEBAR_KEYBOARD_SHORTCUT_BARE;

  return (
    <TooltipShortcut label={label} shortcut={shortcut} side='right'>
      <CircleIconButton
        size='xs'
        variant='secondary'
        onClick={toggleSidebar}
        ariaLabel={label}
        className={className}
      >
        <PanelLeft className='h-3.5 w-3.5' strokeWidth={2} aria-hidden='true' />
      </CircleIconButton>
    </TooltipShortcut>
  );
}
