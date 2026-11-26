import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { DashboardContact } from '@/types/contacts';
import { ContactsManager } from './ContactsManager';

const manager = vi.hoisted(() => ({
  addContact: vi.fn(),
  cancelDelete: vi.fn(),
  confirmDelete: vi.fn(),
  handleDelete: vi.fn(),
  handleSave: vi.fn(),
  updateContact: vi.fn(),
  contacts: [] as DashboardContact[],
  pendingDeleteContact: null as DashboardContact | null,
}));

vi.mock('@/features/dashboard/hooks/useContactsManager', () => ({
  useContactsManager: () => manager,
}));

vi.mock('@/components/features/dashboard/NavigationDestinationReady', () => ({
  NavigationDestinationReady: ({ ready }: { readonly ready: boolean }) => (
    <span data-testid='nav-ready' data-ready={String(ready)} />
  ),
}));

vi.mock('@/features/dashboard/organisms/contacts-table', () => ({
  ContactsTable: (props: {
    isLoading: boolean;
    onAddContact: () => void;
    onDelete: (contact: DashboardContact) => void;
    contacts: DashboardContact[];
  }) => (
    <section aria-label='Contacts' aria-busy={props.isLoading}>
      <button type='button' onClick={() => props.onAddContact()}>
        Add Contact
      </button>
      <button type='button' onClick={() => props.onDelete(props.contacts[0])}>
        Remove Contact
      </button>
    </section>
  ),
}));

vi.mock('@/features/dashboard/molecules/ContactDeleteConfirmDialog', () => ({
  ContactDeleteConfirmDialog: ({
    contact,
    onConfirm,
    onCancel,
  }: {
    contact: DashboardContact | null;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    contact ? (
      <div role='alertdialog' aria-label='Delete contact'>
        <button type='button' onClick={onConfirm}>
          Confirm Delete
        </button>
        <button type='button' onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

const contact: DashboardContact = {
  id: 'contact_1',
  creatorProfileId: 'profile_1',
  role: 'management',
  territories: [],
  isActive: true,
  sortOrder: 0,
};

function renderManager(isLoading = false) {
  return render(
    <ContactsManager
      profileId='profile_1'
      artistName='Sasha Waves'
      artistHandle='sashawaves'
      initialContacts={[contact]}
      isLoading={isLoading}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  manager.contacts = [contact];
  manager.pendingDeleteContact = null;
});

describe('ContactsManager', () => {
  it('adds a contact and stays axe-clean once ready', async () => {
    const user = userEvent.setup();
    const { container } = renderManager();
    expect(screen.getByTestId('nav-ready')).toHaveAttribute(
      'data-ready',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Add Contact' }));
    expect(manager.addContact).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('holds navigation readiness back and marks the table busy while loading', async () => {
    const { container } = renderManager(true);
    expect(screen.getByTestId('nav-ready')).toHaveAttribute(
      'data-ready',
      'false'
    );
    expect(screen.getByRole('region', { name: 'Contacts' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('confirms or cancels a pending delete from the dialog', async () => {
    const user = userEvent.setup();
    manager.pendingDeleteContact = contact;
    const { container } = renderManager();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Confirm Delete' }));
    expect(manager.confirmDelete).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(manager.cancelDelete).toHaveBeenCalledTimes(1);
  });

  it('asks the manager to delete the chosen contact', async () => {
    const user = userEvent.setup();
    renderManager();
    await user.click(screen.getByRole('button', { name: 'Remove Contact' }));
    expect(manager.handleDelete).toHaveBeenCalledWith(contact);
  });
});
