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
   * Compact is for author-confirmed single-line labels; rich permits wrapping.
   * @default 'rich'
   */
  readonly contentVariant?: 'compact' | 'rich';
  /** Opens the tooltip initially, primarily for deterministic previews. */
  readonly defaultOpen?: boolean;
  /**
   * Additional class name for the tooltip content.
   */
  readonly className?: string;
  /**
   * The trigger element (button, link, etc.)
   */
  readonly children: React.ReactElement<{ readonly tabIndex?: number }>;
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
  contentVariant = 'rich',
  defaultOpen,
  className,
  children,
}: SimpleTooltipProps) {
  const trigger = React.cloneElement(children, {
    tabIndex: children.props.tabIndex ?? 0,
  });

  return (
    <Tooltip defaultOpen={defaultOpen}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        showArrow={showArrow}
        contentVariant={contentVariant}
        className={className}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
