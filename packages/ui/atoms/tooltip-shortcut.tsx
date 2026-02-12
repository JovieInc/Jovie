'use client';

import * as React from 'react';

import { Kbd } from './kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface TooltipShortcutProps {
  /**
   * The label text to display in the tooltip
   */
  readonly label: string;
  /**
   * Optional keyboard shortcut to display (e.g., "⌘S", "⌘/Ctrl B")
   */
  readonly shortcut?: string;
  /**
   * Which side of the trigger to show the tooltip
   * @default 'top'
   */
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * The trigger element (button, link, etc.)
   */
  readonly children: React.ReactNode;
}

/**
 * A tooltip wrapper that displays a label with an optional keyboard shortcut.
 * Uses the centralized Kbd component with tooltip variant for consistent styling.
 */
export function TooltipShortcut({
  label,
  shortcut,
  side = 'top',
  children,
}: TooltipShortcutProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <div
          className='grid max-w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2'
          data-testid='tooltip-shortcut-row'
        >
          <span className='min-w-0 text-secondary-token [overflow-wrap:anywhere]'>
            {label}
          </span>
          <span
            data-testid='tooltip-shortcut-slot'
            aria-hidden={!shortcut}
            className='inline-flex min-w-[2.125rem] justify-end'
          >
            {shortcut ? <Kbd variant='tooltip'>{shortcut}</Kbd> : null}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
