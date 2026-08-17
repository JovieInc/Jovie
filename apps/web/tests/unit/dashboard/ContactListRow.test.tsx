import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactListRow } from '@/features/dashboard/molecules/ContactListRow';
import type { EditableContact } from '@/types/contacts';

const contact: EditableContact = {
  id: 'contact-1',
  creatorProfileId: 'profile-1',
  role: 'management',
  customLabel: null,
  personName: 'Kelly Strickland',
  companyName: null,
  territories: ['North America'],
  email: 'kelly@example.com',
  phone: null,
  preferredChannel: null,
  isActive: true,
  sortOrder: 0,
};

describe('ContactListRow', () => {
  it('renders role, name, email, and territory from the shipped contact', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    const { rerender } = render(
      <ContactListRow contact={contact} isSelected={false} onClick={onClick} />
    );

    const row = screen.getByRole('button', { pressed: false });
    expect(row).toHaveTextContent('Management');
    expect(row).toHaveTextContent('Kelly Strickland');
    expect(row).toHaveTextContent('kelly@example.com');
    expect(row).toHaveTextContent('North America');

    await user.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<ContactListRow contact={contact} isSelected onClick={onClick} />);
    expect(screen.getByRole('button', { pressed: true })).toBeVisible();
  });
});
