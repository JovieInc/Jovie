import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PublicContact } from '@/types/contacts';
import { BOOKING_CONTACT, PRESS_CONTACT } from './contact-state-fixtures';

const state = vi.hoisted(() => ({ isMobile: false, track: vi.fn() }));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => state.isMobile,
}));
vi.mock('@/lib/analytics', () => ({ track: state.track }));

import { ArtistContactsButton } from './ArtistContactsButton';

const NO_CHANNEL_CONTACT: PublicContact = {
  ...BOOKING_CONTACT,
  id: 'no-channel',
  channels: [],
};

describe('ArtistContactsButton', () => {
  beforeEach(() => {
    state.isMobile = false;
    state.track.mockReset();
  });

  it('links to the contact mode page on desktop', async () => {
    const { container } = render(
      <ArtistContactsButton
        contacts={[BOOKING_CONTACT]}
        artistHandle='tim'
        artistName='Tim White'
      />
    );

    expect(screen.getByRole('link', { name: 'Contacts' })).toHaveAttribute(
      'href',
      '/tim?mode=contact'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('opens the contact drawer on mobile and tracks the tap', async () => {
    state.isMobile = true;
    const user = userEvent.setup();
    const { container } = render(
      <ArtistContactsButton
        contacts={[BOOKING_CONTACT, NO_CHANNEL_CONTACT, PRESS_CONTACT]}
        artistHandle='tim'
        artistName='Tim White'
      />
    );

    await expectNoA11yViolations(container);
    await user.click(screen.getByRole('button', { name: 'Contacts' }));

    expect(state.track).toHaveBeenCalledWith('contacts_icon_click', {
      handle: 'tim',
      contacts_count: 2,
    });
    const dialog = await screen.findByRole('dialog');
    expect(
      screen.getByRole('heading', { name: 'Contact Tim White' })
    ).toBeVisible();
    expect(screen.getAllByTestId('contact-drawer-item')).toHaveLength(2);
    await expectNoA11yViolations(dialog);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders nothing when no contact has a channel', () => {
    const { container } = render(
      <ArtistContactsButton
        contacts={[NO_CHANNEL_CONTACT]}
        artistHandle='tim'
        artistName='Tim White'
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistContactsButton
          contacts={[BOOKING_CONTACT]}
          artistHandle='tim'
          artistName='تيم وايت'
        />
      </div>
    );

    expect(screen.getByRole('link', { name: 'Contacts' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
