import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContactDeleteConfirmDialog } from './ContactDeleteConfirmDialog';

function renderDialog(
  contact: React.ComponentProps<typeof ContactDeleteConfirmDialog>['contact']
) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <ContactDeleteConfirmDialog
      contact={contact}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
  return { ...result, onConfirm, onCancel };
}

describe('ContactDeleteConfirmDialog', () => {
  it('names the role being removed and confirms the delete', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({
      role: 'management',
      customLabel: null,
    });

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Contact' });
    expect(dialog).toHaveTextContent(
      'Remove the "Management" contact from your profile? This action cannot be undone.'
    );
    await expectNoA11yViolations(dialog);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancels without deleting', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({
      role: 'other',
      customLabel: 'Booking agent',
    });

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '"Booking agent"'
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onCancel).toHaveBeenCalled());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Escape', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog({
      role: 'management',
      customLabel: null,
    });

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing while no contact is pending deletion', async () => {
    const { container } = renderDialog(null);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a long label and right-to-left copy accessible', async () => {
    const label =
      'European festival booking and routing partner for the spring and summer tour legs';
    const { unmount } = renderDialog({ role: 'other', customLabel: label });
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(label);
    await expectNoA11yViolations(dialog);
    unmount();

    render(
      <div dir='rtl'>
        <ContactDeleteConfirmDialog
          contact={{ role: 'other', customLabel: 'وكيل الحجوزات' }}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </div>
    );
    const rtlDialog = screen.getByRole('alertdialog');
    expect(rtlDialog).toHaveTextContent('وكيل الحجوزات');
    await expectNoA11yViolations(rtlDialog);
  });
});
