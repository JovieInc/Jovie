'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

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
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ asChild = true, ...props }, ref) => (
  <TooltipPrimitive.Trigger ref={ref} asChild={asChild} {...props} />
));
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  /**
   * Whether to show the arrow pointer. Defaults to true.
   */
  showArrow?: boolean;
}

/**
 * Tooltip content with Tailwind v4 tokens, dark mode support, and accessibility features.
 * Includes reduced motion support and Apple-level polish.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    { className, sideOffset = 8, showArrow = true, children, ...props },
    ref
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          // Base layout
          'z-50 select-none inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
          // Surface + border with light/dark support (Geist-like pill)
          'bg-surface-1/95 text-primary-token border border-subtle shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[10px]',
          // Animation with reduced motion support
          'animate-in fade-in-0 zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          // Direction-based slide animations
          'data-[side=bottom]:slide-in-from-top-2',
          'data-[side=left]:slide-in-from-right-2',
          'data-[side=right]:slide-in-from-left-2',
          'data-[side=top]:slide-in-from-bottom-2',
          // Reduced motion override
          'motion-reduce:animate-none motion-reduce:data-[state=closed]:animate-none',
          // Motion-reduced fade fallback
          'motion-reduce:transition-opacity motion-reduce:duration-200',
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
            className={cn(
              'fill-surface-1',
              // Ensure arrow matches content background in both light and dark modes
              'drop-shadow-sm'
            )}
          />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
export type { TooltipContentProps };
