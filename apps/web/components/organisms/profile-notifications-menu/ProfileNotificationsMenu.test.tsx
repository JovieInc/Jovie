import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProfileNotificationsMenu } from './ProfileNotificationsMenu';

function renderMenu(
  dsps: readonly { key: string; label: string }[] = [
    { key: 'spotify', label: 'Spotify' },
  ]
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return render(
    <ProfileNotificationsMenu
      artistId='artist-1'
      availableDspPreferences={dsps}
      channelBusy={{}}
      hasActiveSubscriptions={false}
      notificationsState='idle'
      onAddChannel={() => undefined}
      onOpenChange={() => undefined}
      onUnsubscribe={() => undefined}
      open
      subscribedChannels={{ email: false, sms: false }}
      subscriptionDetails={{}}
    />,
    { wrapper }
  );
}

describe('ProfileNotificationsMenu', () => {
  it('renders Title Case section labels when open', () => {
    renderMenu();

    const dialog = screen.getByRole('dialog', {
      name: 'Notification Preferences',
    });
    const platform = screen.getByRole('combobox', {
      name: 'Preferred streaming platform',
    });
    expect(dialog).toContainElement(platform);
    expect(platform.closest('[role="menu"]')).toBeNull();
    expect(screen.getByText('How You Get Notified')).toBeInTheDocument();
    expect(screen.getByText('Listening Preference')).toBeInTheDocument();
    expect(screen.getByText('What You Hear About')).toBeInTheDocument();
    expect(screen.queryByText('Instagram DMs')).not.toBeInTheDocument();
    expect(screen.queryByText('Coming soon')).not.toBeInTheDocument();
  });

  it('lets the listener choose a platform and has no axe violations', async () => {
    const user = userEvent.setup();
    renderMenu([
      { key: 'spotify', label: 'Spotify' },
      { key: 'apple_music', label: 'Apple Music' },
    ]);

    const platform = screen.getByRole('combobox', {
      name: 'Preferred streaming platform',
    });
    await user.selectOptions(platform, 'apple_music');
    expect(platform).toHaveValue('apple_music');
    await expectNoA11yViolations(document.body);
  });

  it('offers only the placeholder when no platform is available', async () => {
    renderMenu([]);

    const platform = screen.getByRole('combobox', {
      name: 'Preferred streaming platform',
    });
    expect(platform).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await expectNoA11yViolations(document.body);
  });
});
