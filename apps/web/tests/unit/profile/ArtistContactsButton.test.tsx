import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistContactsButton } from '@/components/profile/artist-contacts-button';
import { encodeContactPayload } from '@/lib/contacts/obfuscation';
import type { PublicContact } from '@/types/contacts';

vi.mock('@statsig/react-bindings', () => {
  const React = require('react');
  return {
    useFeatureGate: () => ({ value: true }),
    StatsigContext: React.createContext({ client: {} }),
  };
});

vi.mock('@/lib/analytics', () => ({
  track: vi.fn(),
}));

function makeContact(overrides: Partial<PublicContact> = {}): PublicContact {
  return {
    id: 'contact-1',
    role: 'bookings',
    roleLabel: 'Bookings',
    territorySummary: 'North America',
    territoryCount: 1,
    channels: [
      {
        type: 'email',
        encoded: encodeContactPayload({
          type: 'email',
          value: 'agent@example.com',
          subject: 'Booking - Test Artist',
          contactId: 'contact-1',
        }),
        preferred: true,
      },
    ],
    ...overrides,
  };
}

describe('ArtistContactsButton', () => {
  it('opens drawer for single contact instead of direct action', () => {
    const navigate = vi.fn();
    render(
      <ArtistContactsButton
        contacts={[makeContact()]}
        artistHandle='test'
        artistName='Test Artist'
        onNavigate={navigate}
      />
    );

    const trigger = screen.getByTestId('contacts-trigger');
    fireEvent.click(trigger);

    // Should open drawer, not navigate directly
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens drawer when multiple contacts are provided', () => {
    const contacts: PublicContact[] = [
      makeContact(),
      makeContact({
        id: 'contact-2',
        role: 'press_pr',
        roleLabel: 'Press',
        territorySummary: 'Europe',
        territoryCount: 1,
      }),
    ];

    const navigate = vi.fn();
    render(
      <ArtistContactsButton
        contacts={contacts}
        artistHandle='test'
        artistName='Test Artist'
        onNavigate={navigate}
      />
    );

    const trigger = screen.getByTestId('contacts-trigger');
    fireEvent.click(trigger);

    expect(navigate).not.toHaveBeenCalled();
  });
});
