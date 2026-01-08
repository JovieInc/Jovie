import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { ErrorBanner } from './ErrorBanner';

export interface ErrorDialogProps {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
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
}: ErrorDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      className='bg-base p-6 shadow-xl ring-1 ring-border-subtle'
    >
      <div className='space-y-4' data-testid='app-error-dialog'>
        <ErrorBanner title={title} description={description} />
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogBody>
          <p className='text-sm text-secondary-token'>
            Something went wrong while processing your request. You can retry
            the last action or close this dialog to continue where you left off.
          </p>
        </DialogBody>
        <DialogActions>
          {secondaryActionLabel ? (
            <button
              type='button'
              onClick={onSecondaryAction ?? onClose}
              className='inline-flex items-center justify-center rounded-md border border-subtle px-4 py-2 text-sm font-medium text-primary-token transition hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type='button'
            onClick={onPrimaryAction ?? onClose}
            className='inline-flex items-center justify-center rounded-md bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-foreground transition hover:bg-btn-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent'
            data-testid='error-dialog-primary-action'
          >
            {primaryActionLabel ?? 'Retry'}
          </button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
