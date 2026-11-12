import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm-dialog';
import { expectNoA11yViolations } from './test-utils/a11y';

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
    expect(confirm).toHaveClass(
      'bg-btn-destructive',
      'text-btn-destructive-foreground'
    );
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

  it('allows a caller to restore its current scoped trigger on close', async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => {
      event.preventDefault();
      screen.getByRole('button', { name: 'Current row action' }).focus();
    });
    const view = (open: boolean) => (
      <>
        <button type='button'>Current row action</button>
        <ConfirmDialog
          open={open}
          onOpenChange={vi.fn()}
          title='Remove saved link?'
          onConfirm={vi.fn()}
          onCloseAutoFocus={onCloseAutoFocus}
        />
      </>
    );
    const { rerender } = render(view(true));
    rerender(view(false));
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledOnce());
    expect(
      screen.getByRole('button', { name: 'Current row action' })
    ).toHaveFocus();
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

  it('confirms once and closes after the action succeeds', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title='Publish changes?'
        body='Your public profile will update immediately.'
        confirmLabel='Publish changes'
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish changes' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledOnce());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('prevents dismissal while an external action is pending', () => {
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title='Disconnecting Spotify'
        body='Jovie is preserving the latest synced data.'
        isLoading={true}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Please wait...' })
    ).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('dialog-overlay'));

    expect(onCancel).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
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

  it('describes the dialog by its body, including fragment bodies', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title='Archive release?'
        body={
          <>
            <p>Fans keep their links.</p>
            <p>You can restore it later.</p>
          </>
        }
        onConfirm={vi.fn()}
      />
    );

    const ids = screen
      .getByRole('alertdialog')
      .getAttribute('aria-describedby');
    expect(ids).toBeTruthy();
    const described = (ids ?? '')
      .split(' ')
      .map(id => document.getElementById(id)?.textContent ?? '')
      .join(' ');
    expect(described).toContain('Fans keep their links.');
    expect(described).toContain('You can restore it later.');
  });

  it('omits aria-describedby without a body and adds the error once shown', async () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title='Disconnect Spotify?'
        confirmLabel='Disconnect'
        onConfirm={async () => {
          throw new Error('Request failed');
        }}
      />
    );

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).not.toHaveAttribute('aria-describedby');

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const alert = await screen.findByRole('alert');
    expect(dialog.getAttribute('aria-describedby')?.split(' ')).toContain(
      alert.id
    );
  });

  it('exposes the APG alertdialog role, not a plain dialog', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => undefined}
        title='Cancel your plan?'
        body='You keep access until the period ends.'
        onConfirm={() => undefined}
      />
    );
    const dialog = screen.getByRole('alertdialog', {
      name: 'Cancel your plan?',
    });
    expect(dialog).toHaveAccessibleDescription(
      'You keep access until the period ends.'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ConfirmDialog accessibility', () => {
  it('has no axe violations when open with only the required props', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Discard unsaved changes?'
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await expectNoA11yViolations(document.body);
  });

  it('has no axe violations in the error state', async () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Disconnect Spotify?'
        body='Synced data stays in your library.'
        confirmLabel='Disconnect'
        onConfirm={vi.fn().mockRejectedValue(new Error('Request failed'))}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Action failed. Please try again.');
    const classes = alert.className.split(/\s+/);
    expect(classes).toContain('text-error-text');
    expect(classes).not.toContain('text-error');
    await expectNoA11yViolations(document.body);
  });

  it('has no axe violations while pending and with long right-to-left copy', async () => {
    const { unmount } = render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title='Disconnect Spotify?'
        isLoading
        onConfirm={vi.fn()}
      />
    );
    await expectNoA11yViolations(document.body);
    unmount();

    render(
      <div dir='rtl'>
        <ConfirmDialog
          open
          onOpenChange={vi.fn()}
          variant='destructive'
          title='هل تريد حذف جهة الاتصال من جمهورك نهائيًا؟'
          body='لن تظهر جهة الاتصال بعد الآن في قائمة الجمهور.'
          cancelLabel='الإبقاء على جهة الاتصال'
          confirmLabel='حذف جهة الاتصال'
          onConfirm={vi.fn()}
        />
      </div>
    );
    await expectNoA11yViolations(document.body);
  });
});
