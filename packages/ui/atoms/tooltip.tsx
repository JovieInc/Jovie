'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import {
  OVERLAY_CONTENT_RADIUS,
  OVERLAY_SURFACE_BASE,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

/**
 * TooltipProvider with sensible defaults for delays and pointer safety.
 * Should be rendered at app-level to provide tooltip context.
 */
const TooltipProvider = ({
  delayDuration = 700,
  skipDelayDuration = 300,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  />
);
TooltipProvider.displayName = TooltipPrimitive.Provider.displayName;

/**
 * Tooltip root component with SSR-safe defaults.
 */
const Tooltip = ({
  open,
  defaultOpen,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => (
  <TooltipPrimitive.Root open={open} defaultOpen={defaultOpen} {...props} />
);
Tooltip.displayName = TooltipPrimitive.Root.displayName;

/**
 * Tooltip trigger that properly forwards refs and manages accessibility.
 */
const TooltipTrigger = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ asChild = true, ...props }, ref) => (
  <TooltipPrimitive.Trigger ref={ref} asChild={asChild} {...props} />
));
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  /**
   * `compact` is reserved for an author-confirmed, single-line label. It keeps
   * the tooltip on one line and applies the compact pill shape. `rich` is the
   * default for any content that may wrap or contain structured children.
   */
  readonly contentVariant?: 'compact' | 'rich';
  /**
   * Whether to show the arrow pointer. Defaults to false for cleaner Linear-style appearance.
   */
  readonly showArrow?: boolean;
  /**
   * Test ID for the tooltip content.
   * @default "tooltip-content"
   */
  readonly testId?: string;
}

/**
 * Tooltip content with tokenized surface styling.
 * z-[150] to sit above shell chrome, right rails, popovers, and drawers.
 * Collision-safe by default: avoidCollisions + collisionPadding (8px) keep the
 * content fully inside the viewport for far-edge triggers (e.g. header rail
 * toggle at the far right) while flipping/shifting as needed.
 * Pure opacity reveal only (fade-in/out) — no decorative zoom or slide/translate
 * per DESIGN.md + .claude/rules/ui.md "No Decorative Hover Motion" + subtraction.
 * Complements shell Tooltip (support-8) + DspAvatarStack pure opacity updates.
 * Includes reduced motion support and accessibility features.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    {
      className,
      sideOffset = 4,
      collisionPadding = 8,
      showArrow = false,
      contentVariant = 'rich',
      children,
      testId = 'tooltip-content',
      ...props
    },
    ref
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        data-testid={testId}
        className={cn(
          // Every overlay shares the same tokenized surface. The content
          // contract, not runtime line measurement, chooses the shape: a
          // compact label is provably one line; all other content is a shared
          // rounded rectangle that may wrap without clipping.
          'z-[150] px-2 py-1 text-xs font-normal tracking-tight',
          OVERLAY_SURFACE_BASE,
          contentVariant === 'compact'
            ? 'rounded-full whitespace-nowrap'
            : `${OVERLAY_CONTENT_RADIUS} max-w-56 break-words`,
          // Pure opacity reveal (fade only) — subtract decorative zoom + slide-ins.
          // Matches parallel support work on shell Tooltip / Dsp for visual parity.
          // No layout shift; cursor-near friendly.
          'animate-in fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          // Reduced motion override (already present; strengthened for parity)
          'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
          'motion-reduce:transition-opacity motion-reduce:duration-150',
          className
        )}
        // Accessibility: ensure proper collision avoidance
        avoidCollisions={true}
        // Pointer safety: prevent tooltip from triggering when cursor passes over it
        onPointerDownOutside={event => {
          event.preventDefault();
        }}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow
            className='fill-surface-0'
            data-testid='tooltip-arrow'
          />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export type { TooltipContentProps };
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
