import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SubscriptionConfirmedBanner } from './SubscriptionConfirmedBanner';

const meta = {
  title: 'Features/Profile/SubscriptionConfirmedBanner',
  component: SubscriptionConfirmedBanner,
  parameters: {
    layout: 'centered',
    nextjs: {
      appDirectory: true,
    },
  },
  render: () => {
    globalThis.history.replaceState({}, '', '/tim?subscribed=confirmed');
    return (
      <div className='w-96'>
        <SubscriptionConfirmedBanner />
      </div>
    );
  },
} satisfies Meta<typeof SubscriptionConfirmedBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmed: Story = {};
