'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { useMenuOriginFocusRestore } from '../lib/overlay-focus';
import {
  centeredContentStyles,
  descriptionStyles,
  footerStyles,
  headerStyles,
  overlayClassName,
  overlayStyles,
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
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  DialogOverlayProps
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(overlayClassName, className)}
    data-slot='dialog-overlay'
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
  /** Full-screen takeovers retain the same focus and dismissal behavior. */
  readonly variant?: 'default' | 'fullscreen';
  /**
   * Test ID for the dialog content.
   * @default "dialog-content"
   */
  readonly testId?: string;
}

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
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
      variant = 'default',
      testId = 'dialog-content',
      onCloseAutoFocus,
      ...props
    },
    ref
  ) => {
    const { contentRef, handleCloseAutoFocus } = useMenuOriginFocusRestore(
      ref,
      onCloseAutoFocus
    );
    const contentClassName = cn(
      variant === 'fullscreen'
        ? cn(
            'fixed inset-0 z-modal grid h-dvh w-full max-w-none gap-0 overflow-hidden bg-(--app-shell-content-surface) text-primary-token',
            overlayStyles.animation
          )
        : cn(
            centeredContentStyles.position,
            centeredContentStyles.layout,
            centeredContentStyles.surface,
            centeredContentStyles.animation,
            centeredContentStyles.rounded
          ),
      'duration-cinematic ease-cinematic',
      centeredContentStyles.reducedMotion,
      className
    );
    const resolvedOverlayProps = {
      ...overlayProps,
      className: cn(
        variant === 'fullscreen' && 'bg-(--app-shell-content-surface)',
        overlayProps?.className
      ),
    };

    const content = (
      <DialogPrimitive.Content
        ref={contentRef}
        className={contentClassName}
        data-slot='dialog-content'
        data-testid={testId}
        {...props}
        onCloseAutoFocus={handleCloseAutoFocus}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={closeButtonClassName}
            data-slot='dialog-close'
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
          <DialogOverlay {...resolvedOverlayProps} />
          {content}
        </>
      );
    }

    return (
      <DialogPortal {...portalProps}>
        <DialogOverlay {...resolvedOverlayProps} />
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
    data-slot='dialog-header'
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
    data-slot='dialog-footer'
    data-testid={testId}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(titleStyles.base, className)}
    data-slot='dialog-title'
    data-testid='dialog-title'
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(descriptionStyles.base, className)}
    data-slot='dialog-description'
    data-testid='dialog-description'
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
