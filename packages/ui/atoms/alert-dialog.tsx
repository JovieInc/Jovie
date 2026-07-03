'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import {
  centeredContentStyles,
  descriptionStyles,
  footerStyles,
  headerStyles,
  overlayClassName,
  titleStyles,
} from '../lib/overlay-styles';
import { cn } from '../lib/utils';
import { Button } from './button';

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(overlayClassName, className)}
    data-testid='alert-dialog-overlay'
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

interface AlertDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> {
  /**
   * Test ID for the alert dialog content.
   * @default "alert-dialog-content"
   */
  readonly testId?: string;
}

const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Content>,
  AlertDialogContentProps
>(({ className, testId = 'alert-dialog-content', ...props }, ref) => {
  const contentClassName = cn(
    centeredContentStyles.position,
    centeredContentStyles.layout,
    centeredContentStyles.surface,
    centeredContentStyles.animation,
    centeredContentStyles.rounded,
    centeredContentStyles.reducedMotion,
    className
  );

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        ref={ref}
        className={contentClassName}
        data-testid={testId}
        {...props}
      />
    </AlertDialogPortal>
  );
});
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

interface AlertDialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Test ID for the alert dialog header.
   * @default "alert-dialog-header"
   */
  readonly testId?: string;
}

const AlertDialogHeader = ({
  className,
  testId = 'alert-dialog-header',
  ...props
}: AlertDialogHeaderProps) => (
  <div
    className={cn(headerStyles.base, className)}
    data-testid={testId}
    {...props}
  />
);
AlertDialogHeader.displayName = 'AlertDialogHeader';

interface AlertDialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Test ID for the alert dialog footer.
   * @default "alert-dialog-footer"
   */
  readonly testId?: string;
}

const AlertDialogFooter = ({
  className,
  testId = 'alert-dialog-footer',
  ...props
}: AlertDialogFooterProps) => (
  <div
    className={cn(footerStyles.base, className)}
    data-testid={testId}
    {...props}
  />
);
AlertDialogFooter.displayName = 'AlertDialogFooter';

const AlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn(titleStyles.base, className)}
    data-testid='alert-dialog-title'
    {...props}
  />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn(descriptionStyles.base, className)}
    data-testid='alert-dialog-description'
    {...props}
  />
));
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName;

type AlertDialogActionVariant =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'ghost'
  | 'link'
  | 'destructive';

interface AlertDialogActionProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> {
  readonly variant?: AlertDialogActionVariant;
  readonly destructive?: boolean;
}

const AlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Action>,
  AlertDialogActionProps
>(({ className, variant = 'primary', destructive = false, ...props }, ref) => {
  const buttonVariant = variant === 'destructive' ? 'primary' : variant;

  return (
    <Button
      asChild
      variant={buttonVariant}
      destructive={destructive || variant === 'destructive'}
      className={className}
    >
      <AlertDialogPrimitive.Action
        ref={ref}
        data-testid='alert-dialog-action'
        {...props}
      />
    </Button>
  );
});
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <Button asChild variant='secondary' className={cn('mt-2 sm:mt-0', className)}>
    <AlertDialogPrimitive.Cancel
      ref={ref}
      data-testid='alert-dialog-cancel'
      {...props}
    />
  </Button>
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
