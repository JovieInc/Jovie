import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  BOOKING_CONTACT,
  LONG_CONTACT,
  PRESS_CONTACT,
  RTL_CONTACT,
} from '../artist-contacts-button/contact-state-fixtures';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track: mocks.track }));

import { ContactView } from './ContactView';

describe('ContactView', () => {
  beforeEach(() => mocks.track.mockReset());

  it('lists each contact with a decoded channel link and tracks a tap', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ContactView
        artistHandle='tim'
        contacts={[BOOKING_CONTACT, PRESS_CONTACT]}
      />
    );

    const items = screen.getAllByTestId('contact-drawer-item');
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText('Bookings')).toBeVisible();
    const actions = screen.getAllByTestId('contact-drawer-channel-action');
    expect(actions[0]).toHaveAttribute(
      'href',
      'mailto:bookings@example.com?subject=Booking%20inquiry'
    );
    expect(actions[1]).toHaveAttribute('href', 'tel:+15550102000');

    actions[0].addEventListener('click', event => event.preventDefault());
    await user.click(actions[0]);
    expect(mocks.track).toHaveBeenCalledWith('contacts_contact_click', {
      handle: 'tim',
      role: 'bookings',
      channel: 'email',
      territory_count: 1,
    });
    await expectNoA11yViolations(container);
  });

  it('keeps a long contact whole and axe-clean', async () => {
    const { container } = render(
      <ContactView artistHandle='tim' contacts={[LONG_CONTACT]} />
    );

    expect(
      screen.getByText('Management and worldwide touring representation')
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: '+3 more territories for Management and worldwide touring representation',
      })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean with an Arabic contact in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ContactView artistHandle='tim' contacts={[RTL_CONTACT]} />
      </div>
    );

    expect(screen.getByText('الحجوزات')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
