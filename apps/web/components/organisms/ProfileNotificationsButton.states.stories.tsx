import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { ProfileNotificationsButton } from './ProfileNotificationsButton';

/**
 * State coverage for the profile bell. These render the same button as
 * ProfileNotificationsButton.stories.tsx and change only the subscription
 * data or the document direction.
 */
const meta = {
  title: 'Organisms/ProfileNotificationsButton States',
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

/** Partial: subscribed, but the channel breakdown has not arrived yet. */
export const PartialSubscribedWithoutChannels: Story = {
  args: {
    hasActiveSubscriptions: true,
    subscribedChannels: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: 'Manage notification preferences' })
    ).toBeVisible();
  },
};

/** Right-to-left: the bell inside an RTL profile header. */
export const RtlProfileHeader: Story = {
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Get alerts' })).toBeVisible();
  },
};
