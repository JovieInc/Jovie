import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ProfileNotificationsMenu } from './ProfileNotificationsMenu';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function QueryDecorator({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta: Meta<typeof ProfileNotificationsMenu> = {
  title: 'Organisms/ProfileNotificationsMenu',
  component: ProfileNotificationsMenu,
  decorators: [
    Story => (
      <QueryDecorator>
        <Story />
      </QueryDecorator>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProfileNotificationsMenu>;

export const Open: Story = {
  args: {
    artistId: 'artist-1',
    availableDspPreferences: [{ key: 'spotify', label: 'Spotify' }],
    channelBusy: {},
    hasActiveSubscriptions: false,
    notificationsState: 'idle',
    onAddChannel: () => undefined,
    onOpenChange: () => undefined,
    onUnsubscribe: () => undefined,
    open: true,
    subscribedChannels: { email: false, sms: false },
    subscriptionDetails: {},
  },
};
