import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditableContact } from '@/components/dashboard/hooks/useContactsManager';
import { ContactDetailSidebar } from '@/components/dashboard/organisms/contacts-table/ContactDetailSidebar';

vi.mock('@/components/molecules/drawer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/molecules/drawer')>();

  return {
    ...actual,
    EntitySidebarShell: ({
      children,
      entityHeader,
      title,
    }: {
      children: ReactNode;
      entityHeader?: ReactNode;
      title: ReactNode;
    }) => (
      <div>
        <div>{title}</div>
        {entityHeader}
        {children}
      </div>
    ),
  };
});

const contact: EditableContact = {
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
};

describe('ContactDetailSidebar', () => {
  it('renders the calm entity header and contact role context', () => {
    render(
      <ContactDetailSidebar
        contact={contact}
        isOpen
        onClose={() => undefined}
        onUpdate={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
    );

    expect(screen.getAllByText('Alex Rivera').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Management').length).toBeGreaterThan(0);
    expect(screen.getByText('Contact Info')).toBeInTheDocument();
    expect(screen.getByText('Territories')).toBeInTheDocument();
  });
});
