import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { rowState } from '@/components/organisms/table/table.styles';
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
      getRowClassName,
      onRowClick,
    }: {
      readonly data: EditableContact[];
      readonly getRowClassName?: (
        row: EditableContact,
        index: number
      ) => string;
      readonly onRowClick?: (row: EditableContact) => void;
    }) => {
      const firstRowClassName = data[0]
        ? (getRowClassName?.(data[0], 0) ?? '')
        : '';

      return (
        <div
          data-first-row-class={firstRowClassName}
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

describe('ContactsTable', () => {
  it('uses shell-selected row chrome and keeps the detail surface flat', () => {
    render(
      <ContactsTable
        contacts={contacts}
        artistName='Tim White'
        onUpdate={() => undefined}
        onSave={async () => undefined}
        onDelete={() => undefined}
        onAddContact={() => undefined}
      />
    );

    expect(screen.getByText('1 contact')).toBeInTheDocument();
    expect(screen.getByTestId('contacts-unified-table')).toHaveAttribute(
      'data-first-row-class',
      ''
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Select first contact' })
    );

    expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
      'data-open',
      'true'
    );
    expect(screen.getByTestId('contact-detail-sidebar')).toHaveAttribute(
      'data-contact-id',
      'contact-1'
    );
    expect(screen.getByTestId('contacts-unified-table')).toHaveAttribute(
      'data-first-row-class',
      rowState.selected
    );
    expect(setHeaderActions).toHaveBeenCalled();
    expect(setTableMeta).toHaveBeenCalled();
  });
});
