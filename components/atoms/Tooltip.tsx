'use client';

import { type ReactNode } from 'react';
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui/atoms/tooltip';

export interface TooltipProps {
  /**
   * Content displayed inside the tooltip. Provide plain text or
   * accessible markup so screen readers can communicate the message
   * effectively.
   */
  content: ReactNode;
  /** Preferred placement of the tooltip */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Keyboard shortcut to display */
  shortcut?: string;
  /** Maximum width of the tooltip in pixels */
  maxWidth?: number;
  /** Whether to wrap text in the tooltip */
  wrapText?: boolean;
  /** Additional class name for the tooltip */
  className?: string;
  /** Child element that triggers the tooltip */
  children: ReactNode;
}

// Individual tooltip component (requires TooltipProvider in parent)
export function Tooltip({
  content,
  placement = 'right',
  shortcut,
  children,
}: TooltipProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <ShadcnTooltip>
        <TooltipTrigger asChild>
          <span className='inline-block'>{children}</span>
        </TooltipTrigger>
        <TooltipContent
          side={placement as 'top' | 'bottom' | 'left' | 'right'}
          sideOffset={8}
        >
          <div className='flex items-center gap-2'>
            {typeof content === 'string' ? <span>{content}</span> : content}
            {shortcut ? (
              <kbd className='ml-1 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide bg-black/10 text-neutral-600 dark:bg-white/20 dark:text-neutral-300'>
                {shortcut}
              </kbd>
            ) : null}
          </div>
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
}

// Export the provider for use at app level
export { TooltipProvider };
