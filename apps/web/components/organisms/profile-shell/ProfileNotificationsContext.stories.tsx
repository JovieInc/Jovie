import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  ProfileNotificationsContext,
  useProfileNotifications,
} from './ProfileNotificationsContext';
import type { ProfileNotificationsContextValue } from './types';

const value: ProfileNotificationsContextValue = {
  state: 'idle',
  setState: () => {},
  hydrationStatus: 'done',
  hasStoredContacts: false,
  notificationsEnabled: true,
  channel: 'email',
  setChannel: () => {},
  subscribedChannels: {},
  setSubscribedChannels: () => {},
  subscriptionDetails: {},
  setSubscriptionDetails: () => {},
  openSubscription: () => {},
  registerInputFocus: () => {},
  smsEnabled: false,
};

function NotificationsReadout() {
  const notifications = useProfileNotifications();
  return (
    <div className='space-y-1 p-4 text-sm text-primary-token'>
      <p>
        state: <span className='font-caption'>{notifications.state}</span>
      </p>
      <p>
        channel: <span className='font-caption'>{notifications.channel}</span>
      </p>
      <p>
        notificationsEnabled:{' '}
        <span className='font-caption'>
          {String(notifications.notificationsEnabled)}
        </span>
      </p>
    </div>
  );
}

const meta = {
  title: 'Organisms/ProfileShell/ProfileNotificationsContext',
  component: NotificationsReadout,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <ProfileNotificationsContext.Provider value={value}>
        <Story />
      </ProfileNotificationsContext.Provider>
    ),
  ],
} satisfies Meta<typeof NotificationsReadout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NotificationsDisabled: Story = {
  decorators: [
    Story => (
      <ProfileNotificationsContext.Provider
        value={{ ...value, notificationsEnabled: false }}
      >
        <Story />
      </ProfileNotificationsContext.Provider>
    ),
  ],
};
