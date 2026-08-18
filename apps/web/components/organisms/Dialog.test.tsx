import { Button } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from './Dialog';

function TestDialog({
  onClose = vi.fn(),
  hideClose = false,
  size = 'lg' as const,
  className,
}: {
  readonly onClose?: () => void;
  readonly hideClose?: boolean;
  readonly size?: React.ComponentProps<typeof Dialog>['size'];
  readonly className?: string;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      hideClose={hideClose}
      size={size}
      className={className}
    >
      <DialogTitle>Confirm changes</DialogTitle>
      <DialogDescription>Review the details before saving.</DialogDescription>
      <DialogBody data-testid='body'>Dialog body</DialogBody>
      <DialogActions>
        <Button variant='outline'>Cancel</Button>
        <Button>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

describe('Dialog compatibility adapter', () => {
  it('uses canonical surface anatomy while preserving app layout slots', () => {
    render(<TestDialog />);

    const content = screen.getByRole('dialog');
    expect(content).toHaveClass(
      'sm:max-w-lg',
      'gap-0',
      'border-default',
      'bg-surface-elevated',
      'rounded-(--system-b-radius-panel)'
    );
    expect(content).not.toHaveClass(
      'rounded-dialog',
      'border-(--app-shell-frame-seam)',
      'bg-(--app-shell-content-surface)'
    );

    expect(screen.getByTestId('body')).toHaveAttribute(
      'data-slot',
      'dialog-body'
    );
    expect(screen.getByTestId('body')).toHaveClass('mt-5', 'min-w-0');

    const actions = screen.getByTestId('dialog-footer');
    expect(actions).toHaveAttribute('data-slot', 'dialog-footer');
    expect(actions).toHaveClass(
      'flex',
      'flex-col-reverse',
      'sm:flex-row',
      'mt-6',
      'gap-3',
      'pt-0',
      '*:w-full',
      'sm:*:w-auto'
    );
  });

  it('preserves size and custom class overrides', () => {
    render(<TestDialog size='2xl' className='custom-dialog-class' />);
    expect(screen.getByRole('dialog')).toHaveClass(
      'sm:max-w-2xl',
      'custom-dialog-class'
    );
  });

  it('calls onClose only when the controlled dialog requests dismissal', () => {
    const onClose = vi.fn();
    render(<TestDialog onClose={onClose} />);

    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can hide the canonical close control', () => {
    render(<TestDialog hideClose />);
    expect(screen.queryByTestId('dialog-close-button')).not.toBeInTheDocument();
  });
});
