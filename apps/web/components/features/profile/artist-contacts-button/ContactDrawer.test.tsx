import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  BOOKING_CONTACT,
  firstChannel,
  LONG_CONTACT,
  PRESS_CONTACT,
} from './contact-state-fixtures';

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track: mocks.track }));

import { ContactDrawer } from './ContactDrawer';

describe('ContactDrawer', () => {
  beforeEach(() => mocks.track.mockReset());

  it('tracks the open, lists the contacts and closes on Escape through onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ContactDrawer
        open
        onOpenChange={onOpenChange}
        artistName='Tim White'
        artistHandle='tim'
        contacts={[BOOKING_CONTACT, PRESS_CONTACT]}
        primaryChannel={firstChannel}
      />
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      screen.getByRole('heading', { name: 'Contact Tim White' })
    ).toBeVisible();
    expect(screen.getAllByTestId('contact-drawer-item')).toHaveLength(2);
    expect(mocks.track).toHaveBeenCalledWith('contacts_drawer_open', {
      handle: 'tim',
      contacts_count: 2,
    });

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await expectNoA11yViolations(dialog);
  });

  it('tracks nothing while closed', () => {
    render(
      <ContactDrawer
        open={false}
        onOpenChange={vi.fn()}
        artistName='Tim White'
        artistHandle='tim'
        contacts={[BOOKING_CONTACT]}
        primaryChannel={firstChannel}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('keeps a long title and contact axe-clean in a right-to-left document', async () => {
    render(
      <div dir='rtl' lang='ar'>
        <ContactDrawer
          open
          onOpenChange={vi.fn()}
          artistName='Tim White and the Midnight Orchestra of Los Angeles'
          artistHandle='tim'
          contacts={[LONG_CONTACT]}
          primaryChannel={firstChannel}
        />
      </div>
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      screen.getByRole('heading', {
        name: 'Contact Tim White and the Midnight Orchestra of Los Angeles',
      })
    ).toBeVisible();
    await expectNoA11yViolations(dialog);
  });
});
