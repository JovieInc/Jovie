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
  title: 'Organisms/ProfileNotificationsMenu/States',
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

/** Loading: an email subscription is being saved, so its control is busy. */
export const LoadingChannelBusy: Story = {
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
    channelBusy: { email: true },
  },
};

/** Empty: no streaming platforms are available to prefer. */
export const EmptyNoPlatforms: Story = {
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
    availableDspPreferences: [],
  },
};

/** Long content: platform labels longer than the select. */
export const LongContentPlatformLabels: Story = {
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
    availableDspPreferences: [
      {
        key: 'long',
        label: 'A Streaming Platform With An Extremely Long Display Name',
      },
      { key: 'spotify', label: 'Spotify' },
    ],
  },
};
