'use client';

import {
  type MouseEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react';
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
  readonly title: ReactNode;
  readonly body?: ReactNode;
  /**
   * @deprecated Use body. Kept for existing app callers during migration.
   */
  readonly description?: ReactNode;
  readonly confirmLabel?: ReactNode;
  readonly cancelLabel?: ReactNode;
  readonly variant?: 'default' | 'destructive';
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly onCloseAutoFocus?: (event: Event) => void;
  readonly onError?: (error: unknown) => void;
  readonly isLoading?: boolean;
  readonly confirmDisabled?: boolean;
  readonly children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  onCloseAutoFocus,
  onError,
  isLoading = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const handlingRef = useRef(false);
  const errorId = useId();
  const loading = isLoading || isPending;
  const content = body ?? description;

  const closeAsCancel = () => {
    if (loading) return;
    onCancel?.();
    onOpenChange(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading && !nextOpen) return;
    if (nextOpen) setErrorMessage(null);
    if (!nextOpen) onCancel?.();
    onOpenChange(nextOpen);
  };

  const handleConfirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (handlingRef.current || loading || confirmDisabled) return;
    handlingRef.current = true;
    setIsPending(true);
    setErrorMessage(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      onError?.(error);
      setErrorMessage('Action failed. Please try again.');
    } finally {
      setIsPending(false);
      handlingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* APG Alert Dialog role (as Radix AlertDialog passes it). Overlay press
          and Escape stay as Cancel, the safe choice, and pending blocks both. */}
      <DialogContent
        role='alertdialog'
        onCloseAutoFocus={onCloseAutoFocus}
        hideClose
        overlayProps={{ onClick: closeAsCancel }}
        onEscapeKeyDown={event => {
          event.preventDefault();
          if (loading) {
            return;
          }
          closeAsCancel();
        }}
        onInteractOutside={event => {
          if (loading) event.preventDefault();
        }}
        aria-describedby={errorMessage ? errorId : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {content ? (
            typeof content === 'string' ? (
              <DialogDescription>{content}</DialogDescription>
            ) : (
              // A wrapper keeps the description id on a real element: Slot
              // drops it on fragments, leaving aria-describedby dangling.
              <DialogDescription asChild>
                <div>{content}</div>
              </DialogDescription>
            )
          ) : null}
        </DialogHeader>
        {children}
        {errorMessage ? (
          <p id={errorId} className='text-sm text-error-text' role='alert'>
            {errorMessage}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant='secondary'
            disabled={loading}
            onClick={closeAsCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || confirmDisabled}
            variant='primary'
            destructive={variant === 'destructive'}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
