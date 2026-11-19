import { TooltipProvider } from '@jovie/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditableContact } from '@/features/dashboard/hooks/useContactsManager';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ContactDetailSidebar } from './ContactDetailSidebar';

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: vi.fn(), error: vi.fn() }),
}));

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
};

function Harness({
  initial,
  onUpdate,
  onSave,
  onClose,
  onDelete,
}: Readonly<{
  initial: EditableContact | null;
  onUpdate: (updates: Partial<EditableContact>) => void;
  onSave: () => void;
  onClose: () => void;
  onDelete: () => void;
}>) {
  const [current, setCurrent] = useState(initial);
  return (
    <ContactDetailSidebar
      contact={current}
      isOpen
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      onUpdate={updates => {
        onUpdate(updates);
        setCurrent(prev => (prev ? { ...prev, ...updates } : prev));
      }}
    />
  );
}

function renderSidebar(
  initial: EditableContact | null,
  { dir }: { dir?: 'rtl' } = {}
) {
  const handlers = {
    onUpdate: vi.fn(),
    onSave: vi.fn(),
    onClose: vi.fn(),
    onDelete: vi.fn(),
  };
  const view = render(
    <TooltipProvider>
      <div dir={dir}>
        <Harness initial={initial} {...handlers} />
      </div>
    </TooltipProvider>
  );
  return { ...view, ...handlers };
}

describe('ContactDetailSidebar', () => {
  it('toggles a territory, saves after the debounce and flushes on close', async () => {
    const user = userEvent.setup();
    const { container, onUpdate, onSave, onClose } = renderSidebar(contact);

    expect(
      screen.getByTestId('contact-detail-entity-header')
    ).toHaveTextContent('Alex Rivera');
    expect(screen.getByTestId('contact-detail-entity-header')).toHaveClass(
      'px-3',
      'pt-3'
    );
    expect(screen.getByTestId('contact-entity-avatar-frame')).toHaveClass(
      'size-14',
      'rounded-full'
    );
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('tab', { name: 'Territories' }));
    const choices = screen.getByTestId('contact-territory-choices');
    await user.click(within(choices).getByRole('button', { name: 'UK' }));
    expect(onUpdate).toHaveBeenLastCalledWith({
      territories: ['North America', 'UK'],
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });

    await user.click(
      within(choices).getByRole('button', { name: 'Worldwide' })
    );
    expect(onUpdate).toHaveBeenLastCalledWith({ territories: ['Worldwide'] });
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the empty selection message', async () => {
    const { container } = renderSidebar(null);
    expect(
      screen.getByText('Select a contact to view details')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('announces saving and save errors', async () => {
    const saving = renderSidebar({ ...contact, isSaving: true });
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    await expectNoA11yViolations(saving.container);
    saving.unmount();

    const failed = renderSidebar({
      ...contact,
      error: 'Could not save contact',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not save contact'
    );
    await expectNoA11yViolations(failed.container);
  });

  it('hides the preferred channel picker for a partial contact', async () => {
    const { container } = renderSidebar({
      ...contact,
      personName: null,
      phone: null,
      territories: [],
    });
    expect(
      screen.getByTestId('contact-detail-entity-header')
    ).toHaveTextContent('North Star');
    expect(
      screen.queryByRole('combobox', { name: 'Preferred Contact Method' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long values and an RTL document accessible', async () => {
    const longName = 'Alexandria Montgomery-Fitzgerald of Westminster';
    const { container } = renderSidebar(
      { ...contact, personName: longName, companyName: 'نجم الشمال' },
      { dir: 'rtl' }
    );
    expect(screen.getAllByText(longName).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
