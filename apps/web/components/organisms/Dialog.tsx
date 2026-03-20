import {
  Dialog as UiDialog,
  DialogContent as UiDialogContent,
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
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function Dialog({
  open,
  onClose,
  size = 'lg',
  hideClose = false,
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
        className={cn(
          sizes[size],
          'rounded-[18px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,var(--linear-bg-surface-0))] p-6 shadow-[0_20px_48px_rgba(0,0,0,0.12)]',
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
  return <div {...props} className={cn('mt-5', className)} />;
}

export function DialogActions({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'mt-6 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto',
        className
      )}
    />
  );
}
