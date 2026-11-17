import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PublicContact } from '@/types/contacts';
import { ProfileContactDrawerContent } from './ProfileContactDrawerContent';

const { trackAction } = vi.hoisted(() => ({ trackAction: vi.fn() }));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: (channel: { type: string }) =>
      channel.type === 'email' ? 'mailto:bookings@example.com' : null,
    trackAction,
  }),
}));

const contact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'United States',
  territoryCount: 2,
  territories: ['United States', 'Canada'],
  companyLabel: 'Wasserman Music',
  channels: [{ type: 'email', encoded: 'bookings' }],
};

function primaryChannel(entry: PublicContact) {
  return entry.channels[0];
}

describe('ProfileContactDrawerContent certificate', () => {
  it('opens the territory list and tracks a channel action', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ProfileContactDrawerContent
        artistHandle='tim'
        contacts={[contact]}
        primaryChannel={primaryChannel}
      />
    );

    await user.click(
      screen.getByRole('button', { name: '+1 more territories for Booking' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Territories')).toBeVisible();
    expect(within(dialog).getByText('Canada')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const action = screen.getByTestId('contact-drawer-channel-action');
    expect(action).toHaveAttribute('href', 'mailto:bookings@example.com');
    action.addEventListener('click', event => event.preventDefault());
    await user.click(action);
    expect(trackAction).toHaveBeenCalledWith(contact.channels[0], contact);
    await expectNoA11yViolations(container);
  });

  it('renders channels as inert icons in read-only mode', async () => {
    const { container } = render(
      <ProfileContactDrawerContent
        artistHandle='tim'
        contacts={[contact]}
        primaryChannel={primaryChannel}
        interactive={false}
      />
    );

    expect(
      screen.queryByTestId('contact-drawer-channel-action')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders no rows when the profile has no contacts', async () => {
    const { container } = render(
      <ProfileContactDrawerContent
        artistHandle='tim'
        contacts={[]}
        primaryChannel={primaryChannel}
      />
    );

    expect(
      screen.getByTestId('profile-contact-drawer-content')
    ).toBeEmptyDOMElement();
    expect(screen.queryAllByTestId('contact-drawer-item')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('keeps a single-territory contact and right-to-left copy axe-clean', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileContactDrawerContent
          artistHandle='tim'
          contacts={[
            {
              ...contact,
              roleLabel: 'الصحافة',
              territories: ['الإمارات'],
              territorySummary: 'الإمارات',
            },
          ]}
          primaryChannel={primaryChannel}
        />
      </div>
    );

    expect(screen.getByText('الصحافة')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
