import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardContact } from '@/types/contacts';

const {
  addContactMock,
  cancelDeleteMock,
  confirmDeleteMock,
  deleteContactMock,
  saveContactMock,
  updateContactMock,
  useContactsManagerMock,
} = vi.hoisted(() => ({
  addContactMock: vi.fn(),
  cancelDeleteMock: vi.fn(),
  confirmDeleteMock: vi.fn(),
  deleteContactMock: vi.fn(),
  saveContactMock: vi.fn(),
  updateContactMock: vi.fn(),
  useContactsManagerMock: vi.fn(),
}));

vi.mock('@/features/dashboard/hooks/useContactsManager', () => ({
  useContactsManager: useContactsManagerMock,
}));

vi.mock('@/features/dashboard/organisms/contacts-table', () => ({
  ContactsTable: (props: {
    contacts: DashboardContact[];
    onUpdate: (id: string, updates: { personName: string }) => void;
    onSave: (contact: DashboardContact) => void;
    onDelete: (contact: DashboardContact) => void;
    onAddContact: () => void;
  }) => (
    <div data-testid='contacts-table'>
      <button type='button' onClick={() => props.onAddContact()}>
        Add
      </button>
      <button
        type='button'
        onClick={() => props.onUpdate('contact_1', { personName: 'Updated' })}
      >
        Update
      </button>
      <button type='button' onClick={() => props.onSave(props.contacts[0])}>
        Save
      </button>
      <button type='button' onClick={() => props.onDelete(props.contacts[0])}>
        Delete
      </button>
    </div>
  ),
}));

vi.mock('@/components/molecules/ConfirmDialog', () => ({
  ConfirmDialog: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  }) =>
    props.open ? (
      <div>
        <button type='button' onClick={() => props.onConfirm()}>
          Confirm delete
        </button>
        <button type='button' onClick={() => props.onOpenChange(false)}>
          Cancel delete
        </button>
      </div>
    ) : null,
}));

import { ContactsManager } from '@/features/dashboard/organisms/ContactsManager';

const contact: DashboardContact = {
  id: 'contact_1',
  creatorProfileId: 'profile_123',
  role: 'bookings',
  customLabel: null,
  personName: 'Avery Agent',
  companyName: null,
  territories: ['Worldwide'],
  email: 'avery@example.com',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

describe('ContactsManager', () => {
  beforeEach(() => {
    for (const mock of [
      addContactMock,
      cancelDeleteMock,
      confirmDeleteMock,
      deleteContactMock,
      saveContactMock,
      updateContactMock,
      useContactsManagerMock,
    ]) {
      mock.mockReset();
    }
    useContactsManagerMock.mockReturnValue({
      contacts: [contact],
      updateContact: updateContactMock,
      handleSave: saveContactMock,
      handleDelete: deleteContactMock,
      confirmDelete: confirmDeleteMock,
      cancelDelete: cancelDeleteMock,
      pendingDeleteContact: contact,
      addContact: addContactMock,
    });
  });

  it('wires table create, update, save, and delete interactions', async () => {
    const user = userEvent.setup();
    render(
      <ContactsManager
        profileId='profile_123'
        artistName='Tim White'
        artistHandle='tim-white'
        initialContacts={[contact]}
      />
    );

    expect(useContactsManagerMock).toHaveBeenCalledWith({
      profileId: 'profile_123',
      artistHandle: 'tim-white',
      initialContacts: [contact],
    });
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(addContactMock).toHaveBeenCalledTimes(1);
    expect(updateContactMock).toHaveBeenCalledWith('contact_1', {
      personName: 'Updated',
    });
    expect(saveContactMock).toHaveBeenCalledWith(contact);
    expect(deleteContactMock).toHaveBeenCalledWith(contact);
  });

  it('wires destructive confirmation and cancellation', async () => {
    const user = userEvent.setup();
    render(
      <ContactsManager
        profileId='profile_123'
        artistName='Tim White'
        artistHandle='tim-white'
        initialContacts={[contact]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));

    expect(confirmDeleteMock).toHaveBeenCalledTimes(1);
    expect(cancelDeleteMock).toHaveBeenCalledTimes(1);
  });
});
