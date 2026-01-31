import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { ErrorBanner } from './ErrorBanner';

export interface ErrorDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly primaryActionLabel?: string;
  readonly onPrimaryAction?: () => void;
  readonly secondaryActionLabel?: string;
  readonly onSecondaryAction?: () => void;
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
      className='bg-white p-6 shadow-xl ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
    >
      <div className='space-y-4' data-testid='app-error-dialog'>
        <ErrorBanner title={title} description={description} />
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <DialogBody>
          <p className='text-sm text-zinc-600 dark:text-zinc-300'>
            Something went wrong while processing your request. You can retry
            the last action or close this dialog to continue where you left off.
          </p>
        </DialogBody>
        <DialogActions>
          {secondaryActionLabel ? (
            <button
              type='button'
              onClick={onSecondaryAction ?? onClose}
              className='inline-flex items-center justify-center rounded-md border border-subtle px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800'
            >
              {secondaryActionLabel}
            </button>
          ) : null}
          <button
            type='button'
            onClick={onPrimaryAction ?? onClose}
            className='inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-900 dark:bg-white dark:text-black'
            data-testid='error-dialog-primary-action'
          >
            {primaryActionLabel ?? 'Retry'}
          </button>
        </DialogActions>
      </div>
    </Dialog>
  );
}
