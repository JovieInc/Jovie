import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContactsTable } from './ContactsTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/contacts',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('./ContactDetailSidebar', () => ({
  ContactDetailSidebar: ({
    contact,
    onClose,
    onSave,
    onDelete,
  }: {
    contact: EditableContact | null;
    onClose: () => void;
    onSave: () => void;
    onDelete: () => void;
  }) =>
    contact ? (
      <div data-testid='contact-detail-sidebar'>
        <span>{contact.personName}</span>
        <button type='button' onClick={onSave}>
          Save contact
        </button>
        <button type='button' onClick={onDelete}>
          Delete contact
        </button>
        <button type='button' onClick={onClose}>
          Close contact
        </button>
      </div>
    ) : null,
}));

const kelly: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Kelly Strickland',
  companyName: 'North Star',
  territories: [],
  email: 'kelly@example.com',
  phone: null,
  preferredChannel: null,
  isActive: true,
  sortOrder: 0,
};

function RightPanel() {
  return <>{useRightPanel()}</>;
}

function renderTable(
  contacts: EditableContact[],
  { isLoading = false, dir }: { isLoading?: boolean; dir?: 'rtl' } = {}
) {
  const handlers = {
    onUpdate: vi.fn(),
    onSave: vi.fn(async (contact: EditableContact) => contact.id),
    onDelete: vi.fn(),
    onAddContact: vi.fn(),
  };
  const view = render(
    <TooltipProvider>
      <HeaderActionsProvider>
        <RightPanelProvider>
          <TableMetaProvider>
            <div dir={dir}>
              <ContactsTable
                contacts={contacts}
                artistName='Tim White'
                isLoading={isLoading}
                {...handlers}
              />
            </div>
            <RightPanel />
          </TableMetaProvider>
        </RightPanelProvider>
      </HeaderActionsProvider>
    </TooltipProvider>
  );
  return { ...view, ...handlers };
}

describe('ContactsTable certificate', () => {
  it('opens a contact row in the detail panel and saves and deletes it', async () => {
    const user = userEvent.setup();
    const { container, onSave, onDelete } = renderTable([kelly]);

    expect(screen.getByTestId('contacts-toolbar-count')).toHaveTextContent(
      '1 contact'
    );
    expect(screen.getByRole('tab', { name: 'Contacts' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expectNoA11yViolations(container);
    await user.click(screen.getByText('Kelly Strickland'));

    const panel = await screen.findByTestId('contact-detail-sidebar');
    expect(panel).toHaveTextContent('Kelly Strickland');
    await user.click(screen.getByRole('button', { name: 'Save contact' }));
    expect(onSave).toHaveBeenCalledWith(kelly);
    await user.click(screen.getByRole('button', { name: 'Delete contact' }));
    expect(onDelete).toHaveBeenCalledWith(kelly);
    await user.click(screen.getByRole('button', { name: 'Close contact' }));
    await waitFor(() =>
      expect(screen.queryByTestId('contact-detail-sidebar')).toBeNull()
    );
  });

  it('adds a contact from the empty state', async () => {
    const user = userEvent.setup();
    const { container, onAddContact } = renderTable([]);

    expect(screen.getByText('No Contacts Yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
    const [toolbarAdd, emptyAdd] = screen.getAllByRole('button', {
      name: 'Add Contact',
    });
    await user.click(emptyAdd);
    await user.click(toolbarAdd);
    expect(onAddContact).toHaveBeenCalledTimes(2);
  });

  it('auto-selects a new contact and announces loading', async () => {
    const loading = renderTable([], { isLoading: true });
    expect(screen.getByText('Loading contacts')).toHaveClass('sr-only');
    await expectNoA11yViolations(loading.container);
    loading.unmount();

    renderTable([{ ...kelly, id: 'temp-1', isNew: true }]);
    expect(
      await screen.findByTestId('contact-detail-sidebar')
    ).toHaveTextContent('Kelly Strickland');
  });

  it('keeps long names and an RTL table accessible', async () => {
    const longName =
      'Alexandria Montgomery-Fitzgerald the Third of Westminster';
    const { container } = renderTable(
      [
        { ...kelly, personName: longName },
        { ...kelly, id: 'c2', personName: 'كيلي' },
      ],
      { dir: 'rtl' }
    );
    expect(screen.getByText(longName)).toBeInTheDocument();
    expect(screen.getByTestId('contacts-toolbar-count')).toHaveTextContent(
      '2 contacts'
    );
    await expectNoA11yViolations(container);
  });

  it('renders rows in the dense (32px) row mode', () => {
    const { container } = renderTable([kelly]);
    const modeNodes = container.querySelectorAll('[data-table-row-mode]');
    expect(modeNodes.length).toBeGreaterThan(0);
    for (const node of modeNodes) {
      expect(node).toHaveAttribute('data-table-row-mode', 'dense');
    }
  });
});
