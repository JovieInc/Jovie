import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ProfileNotificationsButton } from './ProfileNotificationsButton';

const meta = {
  title: 'Organisms/ProfileNotificationsButton',
  component: ProfileNotificationsButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    hasActiveSubscriptions: false,
    notificationsState: 'idle',
    onClick: fn(),
  },
} satisfies Meta<typeof ProfileNotificationsButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GetAlerts: Story = {};

export const Subscribed: Story = {
  args: {
    hasActiveSubscriptions: true,
    subscribedChannels: { email: true, sms: false },
  },
};

export const SubscribedViaBoth: Story = {
  args: {
    hasActiveSubscriptions: true,
    subscribedChannels: { email: true, sms: true },
  },
};

export const Editing: Story = {
  args: {
    notificationsState: 'editing',
    ariaExpanded: true,
  },
};
