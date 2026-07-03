import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders title, description, and actions when open', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Delete this release?'
        description='Fans will lose access to downloads.'
        confirmLabel='Delete'
        onConfirm={vi.fn()}
        variant='destructive'
      />
    );

    expect(screen.getByTestId('confirm-dialog-title')).toHaveTextContent(
      'Delete this release?'
    );
    expect(screen.getByTestId('confirm-dialog-description')).toHaveTextContent(
      'Fans will lose access to downloads.'
    );
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent(
      'Cancel'
    );
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent(
      'Delete'
    );
  });

  it('applies destructive styling to the confirm button', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Remove contact?'
        description='This cannot be undone.'
        onConfirm={vi.fn()}
        variant='destructive'
      />
    );

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm.className).toContain('bg-error');
    expect(confirm.className).toContain('text-[var(--color-error-foreground)]');
  });

  it('calls onConfirm and closes on confirm click', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title='Disconnect platform?'
        description='Your profile will stop syncing.'
        onConfirm={onConfirm}
        variant='destructive'
      />
    );

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await vi.waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('closes on cancel without calling onConfirm', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title='Leave team?'
        description='You will lose access to shared resources.'
        onConfirm={onConfirm}
        variant='destructive'
      />
    );

    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes on escape key', () => {
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title='Cancel subscription?'
        description='Pro access ends at period close.'
        onConfirm={vi.fn()}
        variant='destructive'
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on overlay click', () => {
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title='Delete account?'
        description='All data will be removed.'
        onConfirm={vi.fn()}
        variant='destructive'
      />
    );

    fireEvent.click(screen.getByTestId('dialog-overlay'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('respects confirmDisabled', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Delete account?'
        description='Type DELETE to continue.'
        onConfirm={vi.fn()}
        variant='destructive'
        confirmDisabled
      />
    );

    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
  });

  it('renders optional children between body and footer', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Delete account?'
        description='This cannot be undone.'
        onConfirm={vi.fn()}
        variant='destructive'
      >
        <input data-testid='extra-field' />
      </ConfirmDialog>
    );

    expect(screen.getByTestId('extra-field')).toBeInTheDocument();
  });
});