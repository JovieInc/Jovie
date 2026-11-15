import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  ProfileNotificationsContext,
  useProfileNotifications,
} from './ProfileNotificationsContext';
import type { ProfileNotificationsContextValue } from './types';

function Readout() {
  const notifications = useProfileNotifications();
  return (
    <section aria-label='Notifications'>
      <p>{`state: ${notifications.state}`}</p>
      <p>{`channel: ${notifications.channel}`}</p>
      <p>{`enabled: ${String(notifications.notificationsEnabled)}`}</p>
      <p>{`hydration: ${notifications.hydrationStatus}`}</p>
    </section>
  );
}

describe('ProfileNotificationsContext', () => {
  it('falls back to idle, email and disabled outside a provider', async () => {
    const { container } = render(<Readout />);

    expect(screen.getByText('state: idle')).toBeInTheDocument();
    expect(screen.getByText('channel: email')).toBeInTheDocument();
    expect(screen.getByText('enabled: false')).toBeInTheDocument();
    expect(screen.getByText('hydration: done')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('gives fallback setters that do nothing and never throw', () => {
    const { result } = renderHook(() => useProfileNotifications());

    const value = result.current;
    expect(value).not.toBeNull();
    expect(() => value.setState('editing' as never)).not.toThrow();
    expect(() => value.setChannel('sms' as never)).not.toThrow();
    expect(() => value.openSubscription()).not.toThrow();
    expect(value.subscribedChannels).toEqual({});
    expect(value.smsEnabled).toBe(false);
  });

  it('reads the provided value and its callbacks', async () => {
    const openSubscription = vi.fn();
    const provided = {
      state: 'editing',
      setState: vi.fn(),
      hydrationStatus: 'done',
      hasStoredContacts: true,
      notificationsEnabled: true,
      channel: 'sms',
      setChannel: vi.fn(),
      subscribedChannels: {},
      setSubscribedChannels: vi.fn(),
      subscriptionDetails: {},
      setSubscriptionDetails: vi.fn(),
      openSubscription,
      registerInputFocus: vi.fn(),
      smsEnabled: true,
    } as unknown as ProfileNotificationsContextValue;
    function Opener() {
      const notifications = useProfileNotifications();
      return (
        <>
          <button
            type='button'
            onClick={() => notifications.openSubscription()}
          >
            Turn on notifications
          </button>
          <Readout />
        </>
      );
    }
    const user = userEvent.setup();

    const { container } = render(
      <ProfileNotificationsContext.Provider value={provided}>
        <Opener />
      </ProfileNotificationsContext.Provider>
    );

    expect(screen.getByText('state: editing')).toBeInTheDocument();
    expect(screen.getByText('channel: sms')).toBeInTheDocument();
    expect(screen.getByText('enabled: true')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Turn on notifications' })
    );
    expect(openSubscription).toHaveBeenCalledTimes(1);
    expect(openSubscription).toHaveBeenCalledWith();
    await expectNoA11yViolations(container);
  });
});
