'use client';

import { useRef, useState, type ReactNode } from 'react';

import { Button } from './atoms/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './atoms/dialog';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'destructive';
  readonly onConfirm: () => void | Promise<void>;
  readonly isLoading?: boolean;
  readonly confirmDisabled?: boolean;
}

/**
 * Canonical confirmation dialog for irreversible and destructive actions.
 *
 * Shape: title + body + neutral cancel + confirm (red when destructive).
 * Dismiss: Escape and click-outside both cancel. Focus stays trapped inside.
 *
 * Render one instance per surface; drive open state with `pendingX: T | null`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  isLoading = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const handlingRef = useRef(false);

  const handleConfirm = async () => {
    if (handlingRef.current || confirmDisabled) return;
    handlingRef.current = true;
    setIsPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsPending(false);
      handlingRef.current = false;
    }
  };

  const loading = isLoading || isPending;
  const isDestructive = variant === 'destructive';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        testId='confirm-dialog-content'
        onOpenAutoFocus={event => event.preventDefault()}
      >
        <DialogHeader testId='confirm-dialog-header'>
          <DialogTitle data-testid='confirm-dialog-title'>{title}</DialogTitle>
          {description ? (
            <DialogDescription data-testid='confirm-dialog-description'>
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <DialogFooter testId='confirm-dialog-footer'>
          <Button
            type='button'
            variant='secondary'
            disabled={loading}
            data-testid='confirm-dialog-cancel'
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type='button'
            variant='primary'
            destructive={isDestructive}
            disabled={loading || confirmDisabled}
            data-testid='confirm-dialog-confirm'
            onClick={() => void handleConfirm()}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}