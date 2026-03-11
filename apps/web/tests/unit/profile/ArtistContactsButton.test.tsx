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

// Mock as mobile so drawer behavior is tested (desktop renders a link instead)
vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => true,
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
    // Verify drawer content is visible
    expect(screen.getByText(/bookings/i)).toBeInTheDocument();
  });

  it('renders mailto and tel links in the contact drawer actions', () => {
    const contacts: PublicContact[] = [
      makeContact({
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
          {
            type: 'phone',
            encoded: encodeContactPayload({
              type: 'phone',
              value: '+1 (555) 010-1234',
              contactId: 'contact-1',
            }),
            preferred: false,
          },
          {
            type: 'sms',
            encoded: encodeContactPayload({
              type: 'sms',
              value: '+1 (555) 010-1234',
              contactId: 'contact-1',
            }),
            preferred: false,
          },
        ],
      }),
    ];

    render(
      <ArtistContactsButton
        contacts={contacts}
        artistHandle='test'
        artistName='Test Artist'
      />
    );

    fireEvent.click(screen.getByTestId('contacts-trigger'));

    const channelActions = screen.getAllByTestId(
      'contact-drawer-channel-action'
    );
    expect(channelActions[0]).toHaveAttribute(
      'href',
      'mailto:agent@example.com?subject=Booking%20-%20Test%20Artist'
    );
    expect(channelActions[1]).toHaveAttribute('href', 'tel:+15550101234');
    expect(channelActions[2]).toHaveAttribute('href', 'sms:+15550101234');
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
    // Verify drawer content is visible with both contacts
    expect(screen.getByText(/bookings/i)).toBeInTheDocument();
    expect(screen.getByText(/press/i)).toBeInTheDocument();
  });
});
