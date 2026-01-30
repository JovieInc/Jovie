'use client';

import { TooltipShortcut } from '@jovie/ui';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useSidebar } from '@/components/organisms/Sidebar';
import { SIDEBAR_KEYBOARD_SHORTCUT } from '@/hooks/useSidebarKeyboardShortcut';

interface SidebarCollapseButtonProps {
  readonly className?: string;
}

export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === 'closed';
  const label = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const shortcut = `⌘/Ctrl ${SIDEBAR_KEYBOARD_SHORTCUT.toUpperCase()}`;

  return (
    <TooltipShortcut label={label} shortcut={shortcut} side='right'>
      <CircleIconButton
        size='xs'
        variant='secondary'
        onClick={toggleSidebar}
        ariaLabel={label}
        className={className}
      >
        <div className='flex flex-col items-center justify-center gap-[3px]'>
          <span className='block h-0.5 w-3 rounded-full bg-current' />
          <span className='block h-0.5 w-3 rounded-full bg-current' />
          <span className='block h-0.5 w-3 rounded-full bg-current' />
        </div>
      </CircleIconButton>
    </TooltipShortcut>
  );
}
