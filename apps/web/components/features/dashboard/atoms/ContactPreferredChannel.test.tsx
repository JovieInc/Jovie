import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContactPreferredChannel } from './ContactPreferredChannel';

describe('ContactPreferredChannel', () => {
  it('defaults missing preferred channel to the canonical email radio state', () => {
    render(
      <ContactPreferredChannel
        contactId='contact_1'
        preferredChannel={null}
        onChannelChange={vi.fn()}
      />
    );

    const group = screen.getByRole('radiogroup', { name: 'Default action' });
    const email = screen.getByRole('radio', { name: 'Email' });
    const phone = screen.getByRole('radio', { name: 'Phone' });

    expect(group).toHaveAttribute(
      'aria-labelledby',
      'preferred-contact_1-label'
    );
    expect(email.tagName).toBe('BUTTON');
    expect(email).toHaveAttribute('data-state', 'checked');
    expect(phone).toHaveAttribute('data-state', 'unchecked');
    expect(email.className).toContain('before:h-11');
  });

  it('notifies the owner when the phone radio is selected', () => {
    const onChannelChange = vi.fn();

    render(
      <ContactPreferredChannel
        contactId='contact_1'
        preferredChannel='email'
        onChannelChange={onChannelChange}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Phone' }));

    expect(onChannelChange).toHaveBeenCalledWith('phone');
  });
});
