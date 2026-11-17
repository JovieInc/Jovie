import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { EditableContact } from '@/types/contacts';
import { ContactListRow } from './ContactListRow';

const contact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Jordan Reyes',
  companyName: null,
  territories: ['US'],
  email: 'jordan@northstar.example',
  phone: null,
  preferredChannel: 'email',
  isActive: true,
  sortOrder: 0,
};

describe('ContactListRow', () => {
  it('shows the role, person, email and territory and selects on click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ContactListRow contact={contact} isSelected={false} onClick={onClick} />
    );

    const row = screen.getByRole('button', { name: /Management/ });
    expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(row).toHaveTextContent('Jordan Reyes');
    expect(row).toHaveTextContent('jordan@northstar.example');
    expect(row).toHaveTextContent('US');
    await expectNoA11yViolations(container);

    await user.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks the selected row as pressed and activates from the keyboard', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ContactListRow contact={contact} isSelected onClick={onClick} />
    );

    const row = screen.getByRole('button', { name: /Management/ });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    row.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('falls back to General with only a role', async () => {
    const { container } = render(
      <ContactListRow
        contact={{
          ...contact,
          personName: null,
          email: null,
          territories: [],
        }}
        isSelected={false}
        onClick={vi.fn()}
      />
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('General');
    expect(row).not.toHaveTextContent('Jordan Reyes');
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left contacts accessible', async () => {
    const label =
      'European festival booking and routing partner for spring and summer';
    const { container } = render(
      <div dir='rtl'>
        <ContactListRow
          contact={{
            ...contact,
            role: 'other',
            customLabel: label,
            personName: 'ليلى حداد',
            territories: ['DE', 'FR', 'NL'],
          }}
          isSelected={false}
          onClick={vi.fn()}
        />
      </div>
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent(label);
    expect(row).toHaveTextContent('ليلى حداد');
    await expectNoA11yViolations(container);
  });
});
