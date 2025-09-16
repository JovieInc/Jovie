'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    className={cn(
      // Base overlay styles with improved backdrop
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm',
      // Smooth animations with reduced motion support
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      'data-[state=open]:duration-300 data-[state=closed]:duration-200',
      // Reduced motion: faster, less intense animations
      'motion-reduce:data-[state=open]:duration-150 motion-reduce:data-[state=closed]:duration-100',
      'motion-reduce:backdrop-blur-none',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  [
    // Base styles with proper tokenization
    'fixed z-50 bg-surface-1 text-primary-token shadow-lg border border-subtle',
    // Smooth transitions with reduced motion support
    'transition-all ease-out duration-300',
    'motion-reduce:transition-none motion-reduce:duration-75',
    // Animation states
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=open]:duration-300 data-[state=closed]:duration-200',
    'motion-reduce:data-[state=open]:duration-150 motion-reduce:data-[state=closed]:duration-100',
  ],
  {
    variants: {
      side: {
        top: [
          'inset-x-0 top-0 border-b',
          'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
          'rounded-b-xl',
        ],
        bottom: [
          'inset-x-0 bottom-0 border-t',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
          'rounded-t-xl',
        ],
        left: [
          'inset-y-0 left-0 h-full border-r',
          'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
          'rounded-r-xl',
        ],
        right: [
          'inset-y-0 right-0 h-full border-l',
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          'rounded-l-xl',
        ],
      },
      size: {
        sm: '',
        default: '',
        lg: '',
        xl: '',
        full: '',
      },
    },
    compoundVariants: [
      // Size variants for horizontal sides (left/right)
      {
        side: ['left', 'right'],
        size: 'sm',
        class: 'w-80 max-w-[80vw]',
      },
      {
        side: ['left', 'right'],
        size: 'default',
        class: 'w-96 max-w-[85vw]',
      },
      {
        side: ['left', 'right'],
        size: 'lg',
        class: 'w-[32rem] max-w-[90vw]',
      },
      {
        side: ['left', 'right'],
        size: 'xl',
        class: 'w-[40rem] max-w-[95vw]',
      },
      {
        side: ['left', 'right'],
        size: 'full',
        class: 'w-full',
      },
      // Size variants for vertical sides (top/bottom)
      {
        side: ['top', 'bottom'],
        size: 'sm',
        class: 'h-80 max-h-[80vh]',
      },
      {
        side: ['top', 'bottom'],
        size: 'default',
        class: 'h-96 max-h-[85vh]',
      },
      {
        side: ['top', 'bottom'],
        size: 'lg',
        class: 'h-[32rem] max-h-[90vh]',
      },
      {
        side: ['top', 'bottom'],
        size: 'xl',
        class: 'h-[40rem] max-h-[95vh]',
      },
      {
        side: ['top', 'bottom'],
        size: 'full',
        class: 'h-full',
      },
    ],
    defaultVariants: {
      side: 'right',
      size: 'default',
    },
  }
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Hide the default close button
   */
  hideCloseButton?: boolean;
  /**
   * Custom close button aria-label
   */
  closeButtonAriaLabel?: string;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ 
  side = 'right', 
  size = 'default',
  className, 
  children, 
  hideCloseButton = false,
  closeButtonAriaLabel = 'Close',
  ...props 
}, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        sheetVariants({ side, size }),
        // Content-specific styling
        'flex flex-col gap-4 p-6',
        // Focus management
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        // Ensure proper stacking context
        'isolate',
        className
      )}
      // Enhanced accessibility
      aria-describedby={undefined}
      {...props}
    >
      {children}
      {!hideCloseButton && (
        <SheetPrimitive.Close 
          className={cn(
            // Positioning and base styles
            'absolute right-4 top-4 rounded-md opacity-70',
            // Interactive states with proper tokenization
            'transition-all duration-200 hover:opacity-100',
            'focus:opacity-100 focus:outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            // Enhanced hover and focus states
            'hover:bg-surface-2 focus-visible:bg-surface-2',
            'disabled:pointer-events-none disabled:opacity-50',
            // Size and padding
            'h-8 w-8 flex items-center justify-center',
            // Motion reduction
            'motion-reduce:transition-none'
          )}
          aria-label={closeButtonAriaLabel}
        >
          <X className='h-4 w-4' />
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = SheetPrimitive.Content.displayName;

export const SheetHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col space-y-2 text-center sm:text-left',
      // Better spacing for mobile
      'px-0 pb-4',
      className
    )}
    {...props}
  />
));
SheetHeader.displayName = 'SheetHeader';

export const SheetFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      // Better spacing and borders
      'mt-auto pt-4 gap-2 sm:gap-0',
      // Optional border for visual separation
      'border-t border-subtle',
      className
    )}
    {...props}
  />
));
SheetFooter.displayName = 'SheetFooter';

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-primary-token',
      // Better spacing and line height for readability
      'mb-2',
      className
    )}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn(
      'text-sm text-secondary-token leading-relaxed',
      // Better spacing for readability
      'mb-4',
      className
    )}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;
