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
          // Base layout + spacing
          'z-50 inline-flex select-none items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium leading-tight',
          // Ephemeral surface: translucent, blurred, no border
          'max-w-xs bg-neutral-900/80 text-neutral-100/90 backdrop-blur-xl shadow-[0_18px_60px_-18px_rgba(0,0,0,0.5)]',
          'dark:bg-white/14 dark:text-white/90',
          // Calm animation: slight fade + drift
          'animate-in data-[state=open]:duration-150 data-[state=open]:ease-out',
          'data-[state=closed]:animate-out data-[state=closed]:duration-120 data-[state=closed]:ease-in',
          'fade-in-0 data-[state=closed]:fade-out-0',
          'data-[side=bottom]:slide-in-from-top-1',
          'data-[side=left]:slide-in-from-right-1',
          'data-[side=right]:slide-in-from-left-1',
          'data-[side=top]:slide-in-from-bottom-1',
          'will-change-[transform,opacity]',
          // Reduced motion override
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
            className={cn(
              'fill-neutral-900/80 dark:fill-white/14',
              'drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)] opacity-90'
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
