'use client';

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { ErrorDetails } from './ErrorDetails';

export interface ErrorDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly primaryActionLabel?: string;
  readonly onPrimaryAction?: () => void;
  readonly secondaryActionLabel?: string;
  readonly onSecondaryAction?: () => void;
  readonly error?: Error & { digest?: string };
}

export function ErrorDialog({
  open,
  title,
  description,
  onClose,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  error,
}: ErrorDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      className='bg-surface-1 p-6 shadow-xl ring-1 ring-subtle'
    >
      <div className='space-y-4' data-testid='app-error-dialog'>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogBody>
          <p className='text-sm text-secondary-token'>
            Something went wrong while processing your request. You can retry
            the last action or close this dialog to continue where you left off.
          </p>

          <div className='mt-4'>
            <ErrorDetails
              error={error}
              extraContext={{ Title: title, Description: description }}
            />
          </div>
        </DialogBody>
        <DialogActions>
          {secondaryActionLabel ? (
            <button
              type='button'
              onClick={onSecondaryAction ?? onClose}
              className='inline-flex items-center justify-center rounded-md border border-subtle px-4 py-2 text-sm font-medium text-secondary-token transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type='button'
            onClick={onPrimaryAction ?? onClose}
            className='inline-flex items-center justify-center rounded-md bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-foreground transition hover:bg-btn-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring'
            data-testid='error-dialog-primary-action'
          >
            {primaryActionLabel ?? 'Retry'}
          </button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
