import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactDeleteConfirmDialog } from '@/features/dashboard/molecules/ContactDeleteConfirmDialog';
import { getContactRoleLabel } from '@/lib/contacts/constants';
import type { EditableContact } from '@/types/contacts';

const contact: Pick<EditableContact, 'role' | 'customLabel'> = {
  role: 'bookings',
  customLabel: null,
};

describe('ContactDeleteConfirmDialog', () => {
  it('stays closed when no contact is staged', () => {
    render(
      <ContactDeleteConfirmDialog
        contact={null}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />
    );

    expect(
      screen.queryByRole('heading', { name: 'Delete Contact' })
    ).not.toBeInTheDocument();
  });

  it('renders the Title Case delete confirm from the staged contact', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ContactDeleteConfirmDialog
        contact={contact}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(
      screen.getByRole('heading', { name: 'Delete Contact' })
    ).toBeVisible();
    expect(
      screen.getByText(
        `Remove the "${getContactRoleLabel(contact.role, contact.customLabel)}" contact from your profile? This action cannot be undone.`
      )
    ).toBeVisible();

    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toHaveAttribute('data-destructive', 'true');

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
