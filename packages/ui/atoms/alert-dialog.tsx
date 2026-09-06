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

const alertDialogAnimation = centeredContentStyles.animation
  .split(' ')
  .filter((className) => !className.startsWith('duration-'))
  .concat('duration-cinematic')
  .join(' ');

type AlertDialogOverlayProps = React.ComponentPropsWithoutRef<
  typeof AlertDialogPrimitive.Overlay
>;

const AlertDialogOverlay = React.forwardRef<
  React.ComponentRef<typeof AlertDialogPrimitive.Overlay>,
  AlertDialogOverlayProps
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(overlayClassName, className)}
    data-slot='alert-dialog-overlay'
    data-testid='alert-dialog-overlay'
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

interface AlertDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> {
  readonly portalProps?: React.ComponentPropsWithoutRef<
    typeof AlertDialogPrimitive.Portal
  >;
  readonly overlayProps?: AlertDialogOverlayProps;
  readonly disablePortal?: boolean;
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
  const {
    portalProps,
    overlayProps,
    disablePortal = false,
    ...contentProps
  } = props;
  const contentClassName = cn(
    centeredContentStyles.position,
    centeredContentStyles.layout,
    centeredContentStyles.surface,
    alertDialogAnimation,
    centeredContentStyles.rounded,
    centeredContentStyles.reducedMotion,
    className
  );

  const content = (
    <AlertDialogPrimitive.Content
      ref={ref}
      className={contentClassName}
      data-slot='alert-dialog-content'
      data-testid={testId}
      {...contentProps}
    />
  );

  if (disablePortal) {
    return (
      <>
        <AlertDialogOverlay {...overlayProps} />
        {content}
      </>
    );
  }

  return (
    <AlertDialogPortal {...portalProps}>
      <AlertDialogOverlay {...overlayProps} />
      {content}
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
    data-slot='alert-dialog-header'
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
    data-slot='alert-dialog-footer'
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
    data-slot='alert-dialog-title'
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
    data-slot='alert-dialog-description'
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
        data-slot='alert-dialog-action'
        data-variant={
          destructive || variant === 'destructive' ? 'destructive' : variant
        }
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
  <Button asChild variant='secondary' className={className}>
    <AlertDialogPrimitive.Cancel
      ref={ref}
      data-slot='alert-dialog-cancel'
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
