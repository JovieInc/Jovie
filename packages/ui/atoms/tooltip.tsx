'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import {
  DROPDOWN_TRANSITIONS,
  OVERLAY_COLLISION_PADDING,
  OVERLAY_CONTENT_RADIUS,
  OVERLAY_SIDE_OFFSET,
  TOOLTIP_SURFACE_BASE,
  TOOLTIP_SURFACE_DANGER,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

/**
 * TooltipProvider with sensible defaults for delays and pointer safety.
 * Should be rendered at app-level to provide tooltip context.
 */
const TooltipProviderScope = React.createContext(false);

const TooltipProvider = ({
  delayDuration,
  skipDelayDuration,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => {
  const inherited = React.useContext(TooltipProviderScope);
  // Default wrappers share the app's warm-up window. Explicit timing or
  // hoverability remains available for isolated fixtures and forced notices.
  if (
    inherited &&
    delayDuration === undefined &&
    skipDelayDuration === undefined &&
    props.disableHoverableContent === undefined
  ) {
    return <>{props.children}</>;
  }
  return (
    <TooltipProviderScope.Provider value>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration ?? 300}
        skipDelayDuration={skipDelayDuration ?? 300}
        {...props}
      />
    </TooltipProviderScope.Provider>
  );
};
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
   * `compact` is reserved for an author-confirmed, single-line label. It fits
   * on one line when space allows and wraps at narrow viewport edges. Both
   * variants use the shared rounded-rectangle
   * surface; `rich` is the default for content that may wrap or contain
   * structured children.
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
  /**
   * `danger` swaps the tokenized tooltip surface for the shared error
   * tokens (same ones as MENU_ITEM_DESTRUCTIVE and Banner's error variant)
   * for content that reports a validation or failure state.
   * @default "default"
   */
  readonly tone?: 'default' | 'danger';
}

/**
 * Tooltip content with tokenized surface styling.
 * z-tooltip to sit above shell chrome, right rails, popovers, and drawers.
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
      sideOffset = OVERLAY_SIDE_OFFSET,
      collisionPadding = OVERLAY_COLLISION_PADDING,
      showArrow = false,
      contentVariant = 'rich',
      tone = 'default',
      children,
      testId = 'tooltip-content',
      style,
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
        data-tooltip-content-variant={contentVariant}
        style={{
          maxWidth:
            'min(14rem, var(--radix-tooltip-content-available-width, 14rem))',
          ...style,
        }}
        className={cn(
          // Every overlay shares the same tokenized rounded rectangle. The
          // content contract describes intent; short labels stay on one line
          // when space allows, and long labels wrap without clipping.
          'z-tooltip flex items-center gap-2 max-w-56 break-words whitespace-normal px-2 py-1 text-xs font-normal leading-normal tracking-tight',
          tone === 'danger' ? TOOLTIP_SURFACE_DANGER : TOOLTIP_SURFACE_BASE,
          OVERLAY_CONTENT_RADIUS,
          // Pure opacity reveal (fade only) — subtract decorative zoom + slide-ins.
          // Matches parallel support work on shell Tooltip / Dsp for visual parity.
          // No layout shift; cursor-near friendly.
          DROPDOWN_TRANSITIONS,
          // Reduced motion keeps the opacity transition legible without spatial motion.
          'motion-reduce:transition-opacity motion-reduce:duration-150',
          className
        )}
        // Accessibility: ensure proper collision avoidance
        avoidCollisions={true}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow
            className='fill-surface-tooltip'
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
