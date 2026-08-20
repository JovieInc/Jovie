import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { ProfileNotificationsMenu } from './ProfileNotificationsMenu';

function renderMenu() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return render(
    <ProfileNotificationsMenu
      artistId='artist-1'
      availableDspPreferences={[{ key: 'spotify', label: 'Spotify' }]}
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

    expect(screen.getByText('How You Get Notified')).toBeInTheDocument();
    expect(screen.getByText('Listening Preference')).toBeInTheDocument();
    expect(screen.getByText('What You Hear About')).toBeInTheDocument();
  });
});
