import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicContact } from '@/types/contacts';
import { ProfileContactDrawerContent } from './ProfileContactDrawerContent';

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:press@example.com',
    trackAction: vi.fn(),
  }),
}));

const press: PublicContact = {
  id: 'press',
  role: 'press_pr',
  roleLabel: 'Press',
  territorySummary: 'US & Canada',
  territoryCount: 2,
  territories: ['United States', 'Canada'],
  companyLabel: 'Shore Fire Media',
  channels: [{ type: 'email', encoded: 'press@example.com' }],
} as PublicContact;

describe('ProfileContactDrawerContent', () => {
  it('names the territory overflow with its visible count first', () => {
    render(
      <ProfileContactDrawerContent
        artistHandle='tim'
        contacts={[press]}
        primaryChannel={contact => contact.channels[0]}
      />
    );
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: '+1 — Show all territories for Press',
      })
    ).toHaveTextContent('+1');
  });

  it('renders channel actions as links when interactive and inert spans otherwise', () => {
    const { rerender } = render(
      <ProfileContactDrawerContent
        artistHandle='tim'
        contacts={[press]}
        primaryChannel={contact => contact.channels[0]}
      />
    );
    expect(screen.getByTestId('contact-drawer-channel-action')).toHaveAttribute(
      'href',
      'mailto:press@example.com'
    );

    rerender(
      <ProfileContactDrawerContent
        artistHandle='tim'
        contacts={[press]}
        primaryChannel={contact => contact.channels[0]}
        interactive={false}
      />
    );
    expect(screen.queryByTestId('contact-drawer-channel-action')).toBeNull();
  });
});
