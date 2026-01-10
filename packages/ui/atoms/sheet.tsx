'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import {
  descriptionStyles,
  footerStyles,
  headerStyles,
  overlayClassName,
  titleStyles,
} from '../lib/overlay-styles';
import { cn } from '../lib/utils';
import { CloseButtonIcon, closeButtonClassName } from './close-button';

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
    className={cn(overlayClassName, className)}
    data-testid='sheet-overlay'
    {...props}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  [
    'fixed z-50 gap-4 bg-surface-2 p-6 text-primary-token shadow-lg',
    'transition ease-in-out',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:duration-300 data-[state=open]:duration-500',
    'motion-reduce:animate-none motion-reduce:transition-opacity',
  ].join(' '),
  {
    variants: {
      side: {
        top: [
          'inset-x-0 top-0 border-b border-subtle',
          'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        ].join(' '),
        bottom: [
          'inset-x-0 bottom-0 border-t border-subtle',
          'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        ].join(' '),
        left: [
          'inset-y-0 left-0 h-full w-3/4 border-r border-subtle sm:max-w-sm',
          'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        ].join(' '),
        right: [
          'inset-y-0 right-0 h-full w-3/4 border-l border-subtle sm:max-w-sm',
          'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        ].join(' '),
      },
    },
    defaultVariants: {
      side: 'right',
    },
  }
);

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /**
   * Whether to hide the close button.
   * @default false
   */
  hideClose?: boolean;
  /**
   * Test ID for the sheet content.
   * @default "sheet-content"
   */
  testId?: string;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      side = 'right',
      className,
      children,
      hideClose = false,
      testId = 'sheet-content',
      ...props
    },
    ref
  ) => (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), className)}
        data-testid={testId}
        {...props}
      >
        {children}
        {!hideClose && (
          <SheetPrimitive.Close
            className={closeButtonClassName}
            data-testid='sheet-close-button'
          >
            <CloseButtonIcon />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Test ID for the sheet header.
   * @default "sheet-header"
   */
  testId?: string;
}

export const SheetHeader = ({
  className,
  testId = 'sheet-header',
  ...props
}: SheetHeaderProps) => (
  <div
    className={cn(headerStyles.base, 'space-y-2', className)}
    data-testid={testId}
    {...props}
  />
);
SheetHeader.displayName = 'SheetHeader';

interface SheetFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Test ID for the sheet footer.
   * @default "sheet-footer"
   */
  testId?: string;
}

export const SheetFooter = ({
  className,
  testId = 'sheet-footer',
  ...props
}: SheetFooterProps) => (
  <div
    className={cn(footerStyles.base, className)}
    data-testid={testId}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn(titleStyles.base, className)}
    data-testid='sheet-title'
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
    className={cn(descriptionStyles.base, className)}
    data-testid='sheet-description'
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;
