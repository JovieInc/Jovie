import {
  Dialog as UiDialog,
  DialogContent as UiDialogContent,
  DialogFooter as UiDialogFooter,
} from '@jovie/ui';

export { DialogDescription, DialogTitle } from '@jovie/ui';

import type React from 'react';
import { cn } from '@/lib/utils';

const sizes = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
};

type DialogSize = keyof typeof sizes;

type UiDialogRootProps = React.ComponentPropsWithoutRef<typeof UiDialog>;

interface DialogProps extends Omit<UiDialogRootProps, 'open' | 'onOpenChange'> {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly size?: DialogSize;
  readonly hideClose?: boolean;
  /**
   * Called when the dialog opens and moves focus in. Call
   * `event.preventDefault()` and focus your own element to pick where
   * focus lands (use this instead of `autoFocus`).
   */
  readonly onOpenAutoFocus?: (event: Event) => void;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  size = 'lg',
  hideClose = false,
  onOpenAutoFocus,
  className,
  children,
  ...props
}: DialogProps) {
  return (
    <UiDialog
      open={open}
      onOpenChange={isOpen => {
        if (!isOpen) {
          onClose();
        }
      }}
      {...props}
    >
      <UiDialogContent
        hideClose={hideClose}
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          sizes[size],
          'gap-0 [&>[data-slot=dialog-description]]:mt-1.5 [&>[data-slot=dialog-description]]:pr-10 [&>[data-slot=dialog-title]]:pr-10',
          className
        )}
      >
        {children}
      </UiDialogContent>
    </UiDialog>
  );
}

export function DialogBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      data-slot='dialog-body'
      {...props}
      className={cn('mt-5 min-w-0', className)}
    />
  );
}

export function DialogActions({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <UiDialogFooter
      {...props}
      className={cn(
        'mt-6 items-center gap-3 pt-0 *:w-full sm:*:w-auto',
        className
      )}
    />
  );
}

DialogBody.displayName = 'DialogBody';
DialogActions.displayName = 'DialogActions';
