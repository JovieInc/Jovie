import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { PublicContact } from '@/types/contacts';
import type { NotificationContentType } from '@/types/notifications';
import { ProfileUnifiedDrawer } from './ProfileUnifiedDrawer';
import { PROFILE_STORY_ARTIST } from './profile-story-fixture';

const { trackAction } = vi.hoisted(() => ({ trackAction: vi.fn() }));

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: ({
    children,
    title,
    onBack,
  }: {
    readonly children: ReactNode;
    readonly title?: string;
    readonly onBack?: () => void;
  }) => (
    <section aria-label={title}>
      <h2>{title}</h2>
      {onBack ? (
        <button type='button' onClick={onBack}>
          Back
        </button>
      ) : null}
      {children}
    </section>
  ),
}));

vi.mock('@/features/profile/artist-contacts-button/useArtistContacts', () => ({
  useArtistContacts: () => ({
    getActionHref: () => 'mailto:bookings@example.com',
    trackAction,
  }),
}));

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareActionList: () => <p>Share actions</p>,
}));

vi.mock('@/features/profile/views/PayView', () => ({
  PayView: () => <p>Pay view</p>,
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

const bookingContact: PublicContact = {
  id: 'contact-1',
  role: 'bookings',
  roleLabel: 'Booking',
  territorySummary: 'Worldwide',
  territoryCount: 1,
  channels: [{ type: 'email', encoded: 'bW9va0BleGFtcGxlLmNvbQ==' }],
};

function renderDrawer(
  props: Partial<Parameters<typeof ProfileUnifiedDrawer>[0]> = {}
) {
  const onTogglePref = vi.fn<(key: NotificationContentType) => void>();
  const onUnsubscribe = vi.fn();
  const onViewChange = vi.fn();
  const view = render(
    <ProfileUnifiedDrawer
      open
      onOpenChange={vi.fn()}
      view='notifications'
      onViewChange={onViewChange}
      artist={PROFILE_STORY_ARTIST}
      socialLinks={[]}
      contacts={[bookingContact]}
      primaryChannel={contact => contact.channels[0]}
      dsps={[]}
      isSubscribed
      contentPrefs={{
        newMusic: true,
        tourDates: false,
        merch: false,
        general: false,
      }}
      onTogglePref={onTogglePref}
      onUnsubscribe={onUnsubscribe}
      isUnsubscribing={false}
      shareContext={undefined as never}
      hasTip
      hasContacts
      hasTourDates={false}
      hasReleases={false}
      {...props}
    />
  );
  return { ...view, onTogglePref, onUnsubscribe, onViewChange };
}

describe('ProfileUnifiedDrawer certificate', () => {
  it('toggles alert topics and turns notifications off', async () => {
    const user = userEvent.setup();
    const { container, onTogglePref, onUnsubscribe, onViewChange } =
      renderDrawer();

    const drawer = screen.getByRole('region');
    const switches = within(drawer).getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    await user.click(switches[0]);
    expect(onTogglePref).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: 'Turn off notifications' })
    );
    expect(onUnsubscribe).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onViewChange).toHaveBeenCalledWith('menu');
    await expectNoA11yViolations(container);
  });

  it('disables the turn-off action while notifications are turning off', async () => {
    const user = userEvent.setup();
    const { onUnsubscribe } = renderDrawer({ isUnsubscribing: true });

    const turningOff = screen.getByRole('button', {
      name: 'Turning off…',
    });
    expect(turningOff).toBeDisabled();
    await user.click(turningOff);
    expect(onUnsubscribe).not.toHaveBeenCalled();
  });

  it('tracks a contact channel from the contact view', async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer({ view: 'contact' });

    const action = screen.getByTestId('contact-drawer-channel-action');
    action.addEventListener('click', event => event.preventDefault());
    await user.click(action);
    expect(trackAction).toHaveBeenCalledWith(
      bookingContact.channels[0],
      bookingContact
    );
    await expectNoA11yViolations(container);
  });

  it('explains when payments are not available', async () => {
    const { container } = renderDrawer({ view: 'pay' });

    expect(
      screen.getByRole('heading', { name: 'Pay Tim White' })
    ).toBeVisible();
    expect(screen.getByText('Payments not available yet')).toBeVisible();
    expect(screen.queryByText('Pay view')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps the right-to-left menu axe-clean', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ProfileUnifiedDrawer
          open
          onOpenChange={vi.fn()}
          view='menu'
          onViewChange={onViewChange}
          artist={PROFILE_STORY_ARTIST}
          socialLinks={[]}
          contacts={[]}
          primaryChannel={contact => contact.channels[0]}
          dsps={[]}
          isSubscribed={false}
          contentPrefs={{
            newMusic: false,
            tourDates: false,
            merch: false,
            general: false,
          }}
          onTogglePref={vi.fn()}
          onUnsubscribe={vi.fn()}
          isUnsubscribing={false}
          shareContext={undefined as never}
          hasTip={false}
          hasContacts={false}
          hasTourDates={false}
          hasReleases={false}
        />
      </div>
    );

    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    await user.click(screen.getByRole('menuitem'));
    expect(onViewChange).toHaveBeenCalledWith('share');
    await expectNoA11yViolations(container);
  });
});
