import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog';

function renderConfirmDialog(
  props: Partial<ConfirmDialogProps> & { readonly open?: boolean } = {}
) {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();

  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title='Delete this release?'
      description='This will remove the release from your profile.'
      confirmLabel='Delete'
      variant='destructive'
      onConfirm={onConfirm}
      {...props}
    />
  );

  return { onOpenChange, onConfirm };
}

describe('ConfirmDialog', () => {
  it('renders title, description, and action buttons', () => {
    renderConfirmDialog();

    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent(
      'Delete this release?'
    );
    expect(screen.getByTestId('confirm-dialog-description')).toHaveTextContent(
      'This will remove the release from your profile.'
    );
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent(
      'Cancel'
    );
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent(
      'Delete'
    );
  });

  it('styles destructive confirm with error token classes', () => {
    renderConfirmDialog({ variant: 'destructive' });

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.className).toContain('bg-error');
    expect(confirm.className).toContain('text-[var(--color-error-foreground)]');
  });

  it('closes on cancel click', () => {
    const { onOpenChange } = renderConfirmDialog();

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on escape key', () => {
    const { onOpenChange } = renderConfirmDialog();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on overlay click', () => {
    const { onOpenChange } = renderConfirmDialog();

    fireEvent.click(screen.getByTestId('dialog-overlay'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm and closes on confirm click', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title='Remove contact?'
        description='This cannot be undone.'
        confirmLabel='Remove'
        variant='destructive'
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('keeps focus inside the dialog', () => {
    renderConfirmDialog();

    const dialog = screen.getByRole('dialog');
    const cancelButton = screen.getByTestId('confirm-dialog-cancel');

    cancelButton.focus();
    expect(dialog).toContainElement(document.activeElement);
    expect(cancelButton).toHaveFocus();
  });

  it('respects confirmDisabled', () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Delete account?'
        confirmLabel='Delete'
        variant='destructive'
        confirmDisabled
        onConfirm={onConfirm}
      />
    );

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm).toBeDisabled();

    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});