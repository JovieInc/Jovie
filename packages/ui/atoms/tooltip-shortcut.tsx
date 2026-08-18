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
   * Declares the shape contract for the tooltip content. Toolbar labels are
   * compact by definition; explanatory labels should opt into `rich`.
   */
  readonly contentVariant?: 'compact' | 'rich';
  /** Opens the tooltip on first render, primarily for previews and tours. */
  readonly defaultOpen?: boolean;
  /**
   * The trigger element (button, link, etc.)
   */
  readonly children: React.ReactElement;
}

/**
 * A tooltip wrapper that displays a label with an optional keyboard shortcut.
 * Uses the centralized Kbd component with tooltip variant for consistent styling.
 */
export function TooltipShortcut({
  label,
  shortcut,
  side = 'top',
  contentVariant = 'compact',
  defaultOpen,
  children,
}: TooltipShortcutProps) {
  const visibleLabel = label.trim() || 'More information';
  const visibleShortcut = shortcut?.trim();

  return (
    <Tooltip defaultOpen={defaultOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        contentVariant={contentVariant}
        side={side}
        className='flex items-center gap-2'
      >
        <span>{visibleLabel}</span>
        {visibleShortcut && <Kbd variant='tooltip'>{visibleShortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
