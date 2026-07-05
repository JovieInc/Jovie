import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  it('renders title, body, cancel slot, and destructive confirm slot', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title='Delete this release?'
        description='This removes the release from your profile.'
        cancelLabel='Keep Release'
        confirmLabel='Delete Release'
        variant='destructive'
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText('Delete this release?')).toBeInTheDocument();
    expect(
      screen.getByText('This removes the release from your profile.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Keep Release' })
    ).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Delete Release' });
    expect(confirm).toHaveAttribute('data-destructive', 'true');
    expect(confirm.className).toContain('bg-error');
  });

  it('closes as cancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title='Remove contact?'
        description='The contact will no longer appear in your audience.'
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes as cancel when the outside overlay is clicked', () => {
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title='Disconnect platform?'
        description='Jovie will stop syncing this platform.'
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('dialog-overlay'));

    expect(onCancel).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps focus inside the dialog', async () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title='Leave team?'
        description='You will lose access to this workspace.'
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    });
  });

  it('blocks confirm when confirmDisabled is true', () => {
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title='Delete your account?'
        description='This action cannot be undone.'
        confirmDisabled={true}
        onConfirm={onConfirm}
      >
        <input aria-label='Type DELETE to confirm' />
      </ConfirmDialog>
    );

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and shows an error when confirm fails', async () => {
    const onOpenChange = vi.fn();
    const onError = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title='Cancel subscription?'
        description='Your subscription will end after the current billing period.'
        confirmLabel='Cancel Subscription'
        variant='destructive'
        onConfirm={async () => {
          throw new Error('Request failed');
        }}
        onError={onError}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel Subscription' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Action failed. Please try again.'
    );
    expect(onError).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
