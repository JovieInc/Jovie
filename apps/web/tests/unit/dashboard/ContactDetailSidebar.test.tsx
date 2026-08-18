import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { ContactDetailSidebar } from '@/features/dashboard/organisms/contacts-table/ContactDetailSidebar';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/components/molecules/drawer', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/components/molecules/drawer')>();

  return {
    ...actual,
    EntityTabbedRail: ({
      children,
      entityHeader,
      activeTab,
      onTabChange,
      tabOptions,
      tabsAriaLabel,
      tabbedCardTestId,
      title,
    }: {
      children: ReactNode;
      entityHeader?: ReactNode;
      activeTab: string;
      onTabChange: (value: string) => void;
      tabOptions: ReadonlyArray<{ value: string; label: ReactNode }>;
      tabsAriaLabel: string;
      tabbedCardTestId?: string;
      title?: ReactNode;
    }) => (
      <div
        data-entity-header-surface='flat'
        data-workspace-surface='flat'
        data-drawer-class='rounded-none border-y-0 border-r-0 bg-surface-2 shadow-none'
        data-testid='entity-sidebar-shell'
      >
        <div>{title}</div>
        {entityHeader}
        <div data-surface-variant='flat' data-testid={tabbedCardTestId}>
          <div role='tablist' aria-label={tabsAriaLabel}>
            {tabOptions.map(option => (
              <button
                key={option.value}
                type='button'
                role='tab'
                aria-selected={activeTab === option.value}
                onClick={() => onTabChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {children}
        </div>
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
  it('renders the calm entity header and Info tab content by default', async () => {
    const { container } = render(
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
    expect(screen.getByTestId('entity-sidebar-shell')).toHaveAttribute(
      'data-entity-header-surface',
      'flat'
    );
    expect(screen.getByTestId('entity-sidebar-shell')).toHaveAttribute(
      'data-workspace-surface',
      'flat'
    );
    expect(screen.getByTestId('entity-sidebar-shell')).toHaveAttribute(
      'data-drawer-class',
      'rounded-none border-y-0 border-r-0 bg-surface-2 shadow-none'
    );
    expect(
      screen.getByTestId('contact-detail-entity-header')
    ).toBeInTheDocument();
    expect(screen.getByTestId('contact-detail-entity-header')).toHaveAttribute(
      'data-layout',
      'grid'
    );
    const avatarFrame = screen.getByTestId('contact-entity-avatar-frame');
    const avatarMedia = avatarFrame.firstElementChild;
    expect(avatarFrame).toHaveClass(
      'size-14',
      'p-1',
      'rounded-[calc(var(--radius-lg)+var(--space-1))]',
      'shadow-none'
    );
    expect(avatarMedia).toHaveClass('size-12', 'rounded-lg');
    expect(avatarFrame).toHaveTextContent('AR');
    expect(
      screen
        .getByTestId('contact-detail-entity-header')
        .querySelector('[data-entity-header-actions]')
    ).toBeInTheDocument();
    expect(screen.getByTestId('entity-header-meta-slot')).toBeInTheDocument();
    expect(
      screen
        .getByTestId('contact-detail-entity-header')
        .querySelector('[data-testid="drawer-card-action-bar"]')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Contact')).not.toBeInTheDocument();
    expect(screen.getByText('Contact Info')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(0);
    expect(screen.getByTestId('contact-detail-tabbed-card')).toHaveAttribute(
      'data-surface-variant',
      'flat'
    );
    expect(screen.getByText('Role')).not.toHaveClass('uppercase');
    expect(screen.getByRole('combobox', { name: 'Contact Type' })).toHaveClass(
      'rounded-full',
      'bg-surface-1'
    );
    await expectNoA11yViolations(container);
  });

  it('shows Territories when the Territories tab is clicked', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    render(
      <ContactDetailSidebar
        contact={contact}
        isOpen
        onClose={() => undefined}
        onUpdate={onUpdate}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Territories' }));

    expect(screen.getAllByText('Territories').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('group', { name: 'Contact territories' })
    ).toHaveClass('flex-wrap', 'gap-1.5');
    expect(screen.getByRole('button', { name: 'North America' })).toHaveClass(
      'min-h-11',
      'sm:min-h-7',
      'bg-surface-1',
      'shadow-none'
    );

    await user.click(screen.getByRole('button', { name: 'Europe (ex-UK)' }));
    expect(onUpdate).toHaveBeenCalledWith({
      territories: ['North America', 'Europe (ex-UK)'],
    });
  });

  it('keeps saving and error feedback semantic without introducing cards', () => {
    const contactWithFeedback: EditableContact = {
      ...contact,
      error: 'Unable to save contact.',
      isSaving: true,
    };

    const { container } = render(
      <ContactDetailSidebar
        contact={contactWithFeedback}
        isOpen
        onClose={() => undefined}
        onUpdate={() => undefined}
        onSave={() => undefined}
        onDelete={() => undefined}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to save contact.'
    );
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    expect(
      container.querySelectorAll('[data-surface-variant="card"]')
    ).toHaveLength(0);
  });
});
