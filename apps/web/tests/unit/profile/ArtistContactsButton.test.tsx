import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArtistContactsButton } from '@/components/profile/artist-contacts-button';
import type { PublicContact } from '@/types/contacts';

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: true }),
}));

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
        actionUrl:
          'mailto:agent@example.com?subject=Booking%20-%20Test%20Artist',
        preferred: true,
      },
    ],
    ...overrides,
  };
}

describe('ArtistContactsButton', () => {
  it('fires direct action for single contact with single channel', () => {
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

    expect(navigate).toHaveBeenCalledWith(
      'mailto:agent@example.com?subject=Booking%20-%20Test%20Artist'
    );
  });

  it('shows dropdown when multiple contacts are provided', () => {
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
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(trigger);

    expect(navigate).not.toHaveBeenCalled();
  });
});
