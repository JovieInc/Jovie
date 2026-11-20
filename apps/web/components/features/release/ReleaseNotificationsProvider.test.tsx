import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useContext } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileNotificationsContext } from '@/components/organisms/profile-shell';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { Artist } from '@/types/db';

const mocks = vi.hoisted(() => ({
  controllerOptions: vi.fn(),
  openSubscription: vi.fn(),
  setChannel: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: mocks.showSuccess,
    error: mocks.showError,
  }),
}));

vi.mock(
  '@/components/organisms/hooks/useProfileNotificationsController',
  () => ({
    useProfileNotificationsController: (options: unknown) => {
      mocks.controllerOptions(options);
      return {
        channel: 'email',
        hasStoredContacts: true,
        hydrationStatus: 'done',
        openSubscription: mocks.openSubscription,
        registerInputFocus: vi.fn(),
        setChannel: mocks.setChannel,
        setState: vi.fn(),
        setSubscribedChannels: vi.fn(),
        setSubscriptionDetails: vi.fn(),
        state: 'idle',
        subscribedChannels: { email: true },
        subscriptionDetails: {},
        contentPreferences: undefined,
        artistEmail: 'artist@example.com',
      };
    },
  })
);

import { ReleaseNotificationsProvider } from './ReleaseNotificationsProvider';

const ARTIST = {
  id: 'artist-1',
  owner_user_id: 'user-1',
  name: 'Tim White',
  handle: 'timwhite',
  spotify_id: '4u',
  location: null,
  hometown: null,
  career_highlights: null,
  is_verified: true,
  active_since_year: null,
  published: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2026-04-24T00:00:00.000Z',
} satisfies Artist;

function NotificationsProbe() {
  const context = useContext(ProfileNotificationsContext);
  return (
    <main>
      <p>
        {context?.notificationsEnabled ? 'Alerts on' : 'Alerts off'} ·{' '}
        {context?.smsEnabled ? 'SMS' : 'Email only'} · {context?.state}
      </p>
      <button type='button' onClick={() => context?.openSubscription()}>
        Get alerts
      </button>
      <button type='button' onClick={() => context?.setChannel('sms')}>
        Use SMS
      </button>
    </main>
  );
}

describe('ReleaseNotificationsProvider', () => {
  it('wires the controller to this artist and the shared notification toasts', () => {
    render(
      <ReleaseNotificationsProvider artist={ARTIST}>
        <NotificationsProbe />
      </ReleaseNotificationsProvider>
    );

    expect(mocks.controllerOptions).toHaveBeenCalledWith({
      artistHandle: 'timwhite',
      artistId: 'artist-1',
      notificationsEnabled: true,
      onError: mocks.showError,
      onSuccess: mocks.showSuccess,
    });
  });

  it('exposes an enabled, email-only context whose actions reach the controller', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ReleaseNotificationsProvider artist={ARTIST}>
        <NotificationsProbe />
      </ReleaseNotificationsProvider>
    );

    expect(screen.getByText('Alerts on · Email only · idle')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Get alerts' }));
    expect(mocks.openSubscription).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Use SMS' }));
    expect(mocks.setChannel).toHaveBeenCalledWith('sms');
    await expectNoA11yViolations(container);
  });

  it('passes long and right-to-left children through unchanged', async () => {
    const longCopy =
      'Get an alert the moment the next release, tour date or merch drop goes live, on every service you already use.';
    const { container } = render(
      <ReleaseNotificationsProvider artist={ARTIST}>
        <main dir='rtl' lang='ar'>
          <p>احصل على التنبيهات</p>
          <p>{longCopy}</p>
        </main>
      </ReleaseNotificationsProvider>
    );

    expect(screen.getByText('احصل على التنبيهات')).toBeVisible();
    expect(screen.getByText(longCopy)).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
