'use client';

import { type ReactNode } from 'react';
import { 
  Tooltip as ShadcnTooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

export interface TooltipProps {
  /**
   * Content displayed inside the tooltip. Provide plain text or
   * accessible markup so screen readers can communicate the message
   * effectively.
   */
  content: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  shortcut?: string;
  children: ReactNode;
}

// Individual tooltip component (requires TooltipProvider in parent)
export function TooltipContent_({
  content,
  placement = 'right',
  shortcut,
  children,
}: TooltipProps) {
  const side = placement as 'top' | 'bottom' | 'left' | 'right';
  
  return (
    <ShadcnTooltip>
      <TooltipTrigger asChild>
        <span className="inline-block">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
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
  );
}

// Backward compatible tooltip with its own provider for easy migration
export function Tooltip({
  content,
  placement = 'right',
  shortcut,
  children,
}: TooltipProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <TooltipContent_ content={content} placement={placement} shortcut={shortcut}>
        {children}
      </TooltipContent_>
    </TooltipProvider>
  );
}

// Export the provider for use at app level
export { TooltipProvider };
