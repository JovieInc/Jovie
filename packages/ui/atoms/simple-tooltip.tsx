'use client';

import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export interface SimpleTooltipProps {
  /**
   * The content to display in the tooltip. Can be a string or ReactNode.
   */
  readonly content: React.ReactNode;
  /**
   * Which side of the trigger to show the tooltip.
   * @default 'top'
   */
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * Distance from the trigger element in pixels.
   * @default 6
   */
  readonly sideOffset?: number;
  /**
   * Whether to show the arrow pointer.
   * @default false
   */
  readonly showArrow?: boolean;
  /**
   * Additional class name for the tooltip content.
   */
  readonly className?: string;
  /**
   * The trigger element (button, link, etc.)
   */
  readonly children: React.ReactNode;
}

/**
 * A simplified tooltip wrapper for common use cases.
 * Provides a cleaner API when you just need to wrap an element with a tooltip.
 *
 * Note: Requires TooltipProvider to be present in the component tree (usually at app level).
 *
 * @example
 * ```tsx
 * <SimpleTooltip content="Save changes">
 *   <button>Save</button>
 * </SimpleTooltip>
 *
 * <SimpleTooltip content={<span>Custom <strong>content</strong></span>} side="right">
 *   <IconButton />
 * </SimpleTooltip>
 * ```
 */
export function SimpleTooltip({
  content,
  side = 'top',
  sideOffset,
  showArrow,
  className,
  children,
}: SimpleTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        showArrow={showArrow}
        className={className}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
