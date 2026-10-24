import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import { ProfileContactDrawerContent } from './ProfileContactDrawerContent';

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => null,
    trackAction: vi.fn(),
  }),
}));

const contact: PublicContact = {
  id: 'contact-1',
  roleLabel: 'Booking',
  territories: ['US', 'CA'],
  territorySummary: 'US',
  channels: [],
} as unknown as PublicContact;

describe('ProfileContactDrawerContent territory overflow', () => {
  it('names the territory overflow trigger starting with its visible +N text (WCAG 2.5.3)', () => {
    render(
      <ProfileContactDrawerContent
        artistHandle='artist'
        contacts={[contact]}
        primaryChannel={() => null as never}
      />
    );

    const trigger = screen.getByRole('button', {
      name: '+1 more territories for Booking',
    });
    expect(trigger).toHaveTextContent('+1');
  });
});
