'use client';

import {
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { CircleIconButton } from '@/components/atoms/CircleIconButton';
import { useSidebar } from '@/components/organisms/Sidebar';
import { SIDEBAR_KEYBOARD_SHORTCUT } from '@/hooks/useSidebarKeyboardShortcut';

interface SidebarCollapseButtonProps {
  className?: string;
}

export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === 'closed';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <CircleIconButton
            size='xs'
            variant='secondary'
            onClick={toggleSidebar}
            ariaLabel={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={className}
          >
            <div className='flex flex-col items-center justify-center gap-[3px]'>
              <span className='block h-0.5 w-3 rounded-full bg-current' />
              <span className='block h-0.5 w-3 rounded-full bg-current' />
              <span className='block h-0.5 w-3 rounded-full bg-current' />
            </div>
          </CircleIconButton>
        </TooltipTrigger>
        <TooltipContent side='right' className='font-medium'>
          <div className='flex items-center gap-2'>
            <span>{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
            <Kbd>⌘/Ctrl {SIDEBAR_KEYBOARD_SHORTCUT.toUpperCase()}</Kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
