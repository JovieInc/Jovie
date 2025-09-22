'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SidebarCollapseButtonProps {
  className?: string;
}

export function SidebarCollapseButton({
  className,
}: SidebarCollapseButtonProps) {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant='ghost'
            size='icon'
            onClick={toggleSidebar}
            className={cn(
              // Base styles - ChatGPT inspired square button
              'relative h-9 w-9 rounded-lg transition-all duration-300 ease-out',
              'bg-surface-1 hover:bg-surface-2 active:bg-surface-3',
              'border border-subtle hover:border-default',
              'shadow-sm hover:shadow-md dark:shadow-black/20',

              // Linear-inspired sophisticated interactions
              'transform hover:scale-105 active:scale-95',
              'hover:-translate-y-0.5 active:translate-y-0',
              'group relative overflow-hidden',

              // Focus states with accessibility
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base',

              // Enhanced for dark mode
              'dark:bg-surface-2 dark:hover:bg-surface-3 dark:active:bg-surface-4',
              'dark:border-border-subtle dark:hover:border-border-default',

              className
            )}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            data-testid='sidebar-collapse-button'
          >
            {/* Subtle glow effect on hover */}
            <div className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
              <div className='absolute inset-0 bg-gradient-to-r from-transparent via-text-primary/5 to-transparent rounded-lg' />
            </div>

            {/* ChatGPT-style hamburger icon */}
            <div className='relative z-10 flex flex-col items-center justify-center w-4 h-4 transition-all duration-300 ease-out group-hover:scale-110'>
              <div
                className={cn(
                  'w-3 h-0.5 bg-text-primary rounded-full transition-all duration-300 ease-out mb-1',
                  'group-hover:bg-text-primary group-active:bg-text-secondary'
                )}
              />
              <div
                className={cn(
                  'w-3 h-0.5 bg-text-primary rounded-full transition-all duration-300 ease-out mb-1',
                  'group-hover:bg-text-primary group-active:bg-text-secondary'
                )}
              />
              <div
                className={cn(
                  'w-3 h-0.5 bg-text-primary rounded-full transition-all duration-300 ease-out',
                  'group-hover:bg-text-primary group-active:bg-text-secondary'
                )}
              />
            </div>

            {/* Subtle shine effect on hover */}
            <div className='absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700 ease-out' />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side='right'
          align='center'
          className='bg-surface-elevated border-border-subtle text-text-primary text-sm font-medium px-3 py-2 shadow-lg'
        >
          <span>{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          <div className='text-xs text-text-muted mt-1'>⌘B</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
