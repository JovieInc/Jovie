'use client';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { useSidebar } from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';

interface SidebarCollapseButtonProps {
  className?: string;
}

/**
 * @deprecated Use SidebarTrigger from @/components/organisms/Sidebar instead.
 * This component will be removed in a future release.
 *
 * Migration: Replace with:
 * ```tsx
 * import { SidebarTrigger } from '@/components/organisms/Sidebar';
 * <SidebarTrigger className="-ml-1" />
 * ```
 */
export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === 'closed';

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            onClick={toggleSidebar}
            className={cn(
              'relative h-9 w-9 rounded-lg transition-all duration-300 ease-out',
              'bg-surface-1 hover:bg-surface-2 active:bg-surface-3',
              'border border-subtle hover:border-default',
              'shadow-sm hover:shadow-md dark:shadow-black/20',
              'transform hover:scale-105 active:scale-95',
              'group overflow-hidden',
              className
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {/* Sophisticated background effects */}
            <div className='absolute inset-0 bg-gradient-to-br from-transparent via-surface-2/30 to-surface-3/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300' />
            <div className='absolute inset-0 bg-gradient-to-t from-transparent to-surface-1/50 opacity-0 group-active:opacity-100 transition-opacity duration-150' />

            {/* Linear-inspired glow effect */}
            <div className='absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
              <div className='absolute inset-0 bg-gradient-to-r from-transparent via-text-primary/5 to-transparent' />
            </div>

            {/* ChatGPT-style hamburger icon with enhanced styling */}
            <div className='relative z-10 flex flex-col items-center justify-center w-4 h-4 group-hover:scale-110 transition-transform duration-300 ease-out'>
              <div className='w-3 h-0.5 bg-text-primary rounded-full mb-1 transition-all duration-300 group-hover:bg-text-primary group-active:scale-95' />
              <div className='w-3 h-0.5 bg-text-primary rounded-full mb-1 transition-all duration-300 group-hover:bg-text-primary group-active:scale-95' />
              <div className='w-3 h-0.5 bg-text-primary rounded-full transition-all duration-300 group-hover:bg-text-primary group-active:scale-95' />
            </div>

            {/* Subtle focus ring enhancement */}
            <div className='absolute inset-0 rounded-lg ring-2 ring-transparent group-focus-visible:ring-interactive/50 transition-all duration-200' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='right' className='font-medium'>
          <div className='flex items-center gap-2'>
            <span>{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
            <kbd className='inline-flex items-center rounded border border-border bg-surface-1 px-1 font-mono text-xs'>
              ⌘ ⇧ S
            </kbd>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
