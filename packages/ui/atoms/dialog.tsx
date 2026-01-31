'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
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
import { CloseButtonIcon, closeButtonClassName } from './close-button';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

type DialogOverlayProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Overlay
>;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  DialogOverlayProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(overlayClassName, className)}
    data-testid='dialog-overlay'
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  readonly portalProps?: React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Portal
  >;
  readonly overlayProps?: DialogOverlayProps;
  readonly disablePortal?: boolean;
  readonly hideClose?: boolean;
  /**
   * Test ID for the dialog content.
   * @default "dialog-content"
   */
  readonly testId?: string;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      portalProps,
      overlayProps,
      disablePortal = false,
      hideClose = false,
      testId = 'dialog-content',
      ...props
    },
    ref
  ) => {
    const contentClassName = cn(
      centeredContentStyles.position,
      centeredContentStyles.layout,
      centeredContentStyles.surface,
      centeredContentStyles.animation,
      centeredContentStyles.rounded,
      centeredContentStyles.reducedMotion,
      className
    );

    const content = (
      <DialogPrimitive.Content
        ref={ref}
        className={contentClassName}
        data-testid={testId}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={closeButtonClassName}
            data-testid='dialog-close-button'
          >
            <CloseButtonIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    );

    if (disablePortal) {
      return (
        <>
          <DialogOverlay {...overlayProps} />
          {content}
        </>
      );
    }

    return (
      <DialogPortal {...portalProps}>
        <DialogOverlay {...overlayProps} />
        {content}
      </DialogPortal>
    );
  }
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Test ID for the dialog header.
   * @default "dialog-header"
   */
  readonly testId?: string;
}

const DialogHeader = ({
  className,
  testId = 'dialog-header',
  ...props
}: DialogHeaderProps) => (
  <div
    className={cn(headerStyles.base, className)}
    data-testid={testId}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Test ID for the dialog footer.
   * @default "dialog-footer"
   */
  readonly testId?: string;
}

const DialogFooter = ({
  className,
  testId = 'dialog-footer',
  ...props
}: DialogFooterProps) => (
  <div
    className={cn(footerStyles.base, className)}
    data-testid={testId}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(titleStyles.base, className)}
    data-testid='dialog-title'
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(descriptionStyles.base, className)}
    data-testid='dialog-description'
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
