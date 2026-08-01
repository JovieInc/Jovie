import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { ContactsTable } from '@/features/dashboard/organisms/contacts-table/ContactsTable';

const setHeaderActions = vi.fn();
const setTableMeta = vi.fn();

vi.mock('@/contexts/HeaderActionsContext', () => ({
  useSetHeaderActions: () => ({
    setHeaderActions,
  }),
}));

vi.mock('@/contexts/TableMetaContext', () => ({
  useTableMeta: () => ({
    tableMeta: {
      rightPanelWidth: 0,
      toggle: null,
    },
    setTableMeta,
  }),
}));

vi.mock('@/components/organisms/table', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/organisms/table')>();

  return {
    ...actual,
    PAGE_TOOLBAR_META_TEXT_CLASS: 'page-toolbar-meta-text',
    PageToolbar: ({ start }: { readonly start: ReactNode }) => (
      <div data-testid='contacts-toolbar'>{start}</div>
    ),
    convertToCommonDropdownItems: vi.fn(() => []),
    UnifiedTable: ({
      data,
      isRowSelected,
      isLoading,
      onRowClick,
    }: {
      readonly data: EditableContact[];
      readonly isRowSelected?: (row: EditableContact, index: number) => boolean;
      readonly isLoading?: boolean;
      readonly onRowClick?: (row: EditableContact) => void;
    }) => {
      const firstRowSelected = data[0]
        ? String(isRowSelected?.(data[0], 0) ?? false)
        : 'false';

      return (
        <div
          data-first-row-selected={firstRowSelected}
          data-loading={String(isLoading)}
          data-testid='contacts-unified-table'
        >
          {data[0] ? (
            <button type='button' onClick={() => onRowClick?.(data[0])}>
              Select first contact
            </button>
          ) : null}
        </div>
      );
    },
  };
});

vi.mock(
  '@/features/dashboard/organisms/contacts-table/ContactDetailSidebar',
  () => ({
    ContactDetailSidebar: ({
      contact,
      entityHeaderSurface,
      isOpen,
    }: {
      readonly contact: EditableContact | null;
      readonly entityHeaderSurface?: string;
      readonly isOpen: boolean;
    }) => (
      <div
        data-contact-id={contact?.id ?? ''}
        data-entity-header-surface={entityHeaderSurface ?? 'card'}
        data-open={String(isOpen)}
        data-testid='contact-detail-sidebar'
      />
    ),
  })
);

const contacts: EditableContact[] = [
  {
    id: 'contact-1',
    creatorProfileId: 'profile-1',
    role: 'management',
    customLabel: null,
    personName: 'Alex Rivera',
    companyName: 'North Star',
    territories: ['North America'],
    email: 'alex@example.com',
    phone: '+1 555-0101',
    preferredChannel: 'email',
    isActive: true,
    sortOrder: 0,
    isSaving: false,
    isDeleting: false,
    error: null,
    isExpanded: true,
    customTerritory: '',
    isNew: false,
  },
];

function RightPanelOutlet() {
  return <output data-testid='contacts-right-panel'>{useRightPanel()}</output>;
}

function renderContactsTable(props: ComponentProps<typeof ContactsTable>) {
  return render(
    <RightPanelProvider>
      <ContactsTable {...props} />
      <RightPanelOutlet />
    </RightPanelProvider>
  );
}

describe('ContactsTable', () => {
  it('registers details in the shared right rail instead of mounting them beside the table', async () => {
    renderContactsTable({
      contacts,
      artistName: 'Tim White',
      onUpdate: () => undefined,
      onSave: async () => undefined,
      onDelete: () => undefined,
      onAddContact: () => undefined,
    });

    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
        'data-open',
        'false'
      );
    });

    const sidebar = screen.getByTestId('contact-detail-sidebar');
    expect(screen.getByTestId('contacts-table')).not.toContainElement(sidebar);

    expect(screen.getByText('1 contact')).toBeInTheDocument();
    expect(screen.getByTestId('contacts-unified-table')).toHaveAttribute(
      'data-first-row-selected',
      'false'
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select first contact' })
    );

    await waitFor(() => {
      expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
        'data-open',
        'true'
      );
      expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
        'data-contact-id',
        'contact-1'
      );
    });
    expect(screen.getByTestId('contacts-unified-table')).toHaveAttribute(
      'data-first-row-selected',
      'true'
    );
    expect(setHeaderActions).toHaveBeenCalled();
    expect(setTableMeta).toHaveBeenCalled();
  });

  it('forwards loading state to the table instead of showing a false empty state', () => {
    renderContactsTable({
      contacts: [],
      artistName: 'Tim White',
      isLoading: true,
      onUpdate: () => undefined,
      onSave: async () => undefined,
      onDelete: () => undefined,
      onAddContact: () => undefined,
    });

    expect(screen.getByTestId('contacts-table')).toBeInTheDocument();
    expect(screen.getByTestId('contacts-unified-table')).toHaveAttribute(
      'data-loading',
      'true'
    );
    expect(screen.queryByText('No Contacts Yet')).not.toBeInTheDocument();
  });

  it('keeps the header action as the only add contact CTA for the empty state', () => {
    const onAddContact = vi.fn();

    renderContactsTable({
      contacts: [],
      artistName: 'Tim White',
      onUpdate: () => undefined,
      onSave: async () => undefined,
      onDelete: () => undefined,
      onAddContact,
    });

    expect(
      screen.getByRole('heading', { name: 'No Contacts Yet' })
    ).toBeVisible();
    expect(
      screen.getByText('Add bookings, management, and press contacts.')
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add Contact' })
    ).not.toBeInTheDocument();

    expect(setHeaderActions).toHaveBeenCalledWith(expect.anything());
    expect(onAddContact).not.toHaveBeenCalled();
  });
});
