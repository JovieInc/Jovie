'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * Tooltip Provider with sensible defaults for delays and pointer safety.
 * Wrap your app or tooltip-containing sections with this provider.
 */
export interface TooltipProviderProps extends TooltipPrimitive.TooltipProviderProps {
  /**
   * Duration from when the pointer enters the trigger until the tooltip opens.
   * @default 400
   */
  delayDuration?: number;
  /**
   * Duration from when the pointer leaves the trigger until the tooltip closes.
   * @default 300
   */
  skipDelayDuration?: number;
}

const TooltipProvider = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Provider>,
  TooltipProviderProps
>(({ delayDuration = 400, skipDelayDuration = 300, ...props }, ref) => (
  <TooltipPrimitive.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  />
));
TooltipProvider.displayName = 'TooltipProvider';

/**
 * Root tooltip component. Controls the open state.
 */
const Tooltip = TooltipPrimitive.Root;

/**
 * The button or element that triggers the tooltip.
 * Note: For disabled elements, wrap in a span to ensure events fire:
 * <TooltipTrigger asChild>
 *   <span tabIndex={0}>
 *     <button disabled>Disabled button</button>
 *   </span>
 * </TooltipTrigger>
 */
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * Props for the TooltipContent component
 */
export interface TooltipContentProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  /**
   * Distance in pixels from the trigger.
   * @default 8
   */
  sideOffset?: number;
  /**
   * Whether to show an arrow pointing to the trigger.
   * @default false
   */
  showArrow?: boolean;
  /**
   * Custom arrow className for styling.
   */
  arrowClassName?: string;
}

/**
 * The tooltip content that appears when triggered.
 * Supports SSR, reduced motion, and full accessibility.
 */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 8, showArrow = false, arrowClassName, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        // Base styles
        'z-[70] select-none rounded-md px-3 py-1.5',
        // Typography
        'text-xs font-medium leading-none',
        // Colors with CSS variables for theming
        'bg-[--tooltip-bg] text-[--tooltip-fg]',
        // Border and shadow
        'border border-[--tooltip-border] shadow-md',
        // Animation with reduced motion support
        'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95',
        'motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95',
        // Slide animations per side
        'motion-safe:data-[side=bottom]:slide-in-from-top-2',
        'motion-safe:data-[side=left]:slide-in-from-right-2',
        'motion-safe:data-[side=right]:slide-in-from-left-2',
        'motion-safe:data-[side=top]:slide-in-from-bottom-2',
        // Reduced motion: simple fade
        'motion-reduce:transition-opacity motion-reduce:duration-200',
        // Apply CSS variables for light/dark themes
        '[--tooltip-bg:theme(colors.neutral.900)] dark:[--tooltip-bg:theme(colors.neutral.50)]',
        '[--tooltip-fg:theme(colors.white)] dark:[--tooltip-fg:theme(colors.neutral.900)]',
        '[--tooltip-border:theme(colors.neutral.800)] dark:[--tooltip-border:theme(colors.neutral.200)]',
        className
      )}
      // Pointer events configuration for better UX
      onPointerEnterCapture={(e) => {
        // Prevent tooltip from closing when pointer moves to content
        e.preventDefault();
      }}
      onPointerLeaveCapture={() => {
        // Allow normal leave behavior
      }}
      {...props}
    >
      {children}
      {showArrow && (
        <TooltipPrimitive.Arrow
          className={cn(
            'fill-[--tooltip-bg]',
            '[--tooltip-bg:theme(colors.neutral.900)] dark:[--tooltip-bg:theme(colors.neutral.50)]',
            arrowClassName
          )}
          width={11}
          height={5}
        />
      )}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
