'use client';

import {
  Button,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { useSidebar } from '@/components/organisms/Sidebar';
import { SIDEBAR_KEYBOARD_SHORTCUT } from '@/hooks/useSidebarKeyboardShortcut';
import { cn } from '@/lib/utils';

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
          <Button
            variant='ghost'
            size='icon'
            onClick={toggleSidebar}
            className={cn(
              'h-8 w-8 rounded-full border border-subtle bg-surface-1 text-secondary-token',
              'hover:bg-surface-2 hover:text-primary-token shadow-sm',
              'transition-colors duration-150 ease-out',
              className
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <span className='sr-only'>
              {isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </span>
            <div className='flex flex-col items-center justify-center gap-[3px]'>
              <span className='block h-0.5 w-3 rounded-full bg-current' />
              <span className='block h-0.5 w-3 rounded-full bg-current' />
              <span className='block h-0.5 w-3 rounded-full bg-current' />
            </div>
          </Button>
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
