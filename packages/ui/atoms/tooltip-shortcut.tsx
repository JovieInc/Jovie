'use client';

import * as React from 'react';

import { Kbd } from './kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface TooltipShortcutProps {
  /**
   * The label text to display in the tooltip
   */
  label: string;
  /**
   * Optional keyboard shortcut to display (e.g., "⌘S", "⌘/Ctrl B")
   */
  shortcut?: string;
  /**
   * Which side of the trigger to show the tooltip
   * @default 'top'
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * The trigger element (button, link, etc.)
   */
  children: React.ReactNode;
}

/**
 * A tooltip wrapper that displays a label with an optional keyboard shortcut.
 * Uses the centralized Kbd component with tooltip variant for consistent styling.
 *
 * @example
 * ```tsx
 * <TooltipShortcut label="Toggle sidebar" shortcut="⌘/Ctrl B" side="right">
 *   <Button variant="ghost" size="icon">
 *     <PanelLeft />
 *   </Button>
 * </TooltipShortcut>
 * ```
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
        <span>{label}</span>
        {shortcut && <Kbd variant='tooltip'>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
