import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatMerchActionCard } from './ChatMerchActionCard';

const meta = {
  title: 'Jovie/Components/ChatMerchActionCard',
  component: ChatMerchActionCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof ChatMerchActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Publish: Story = {
  args: {
    profileId: 'profile-story',
    merchCardId: 'merch-story-publish',
    action: 'publish',
    title: 'Story Tour Tee',
    currentStatus: 'draft',
    retailPrice: '$32.00',
  },
};

export const Pause: Story = {
  args: {
    profileId: 'profile-story',
    merchCardId: 'merch-story-pause',
    action: 'pause',
    title: 'Story Tour Tee',
    currentStatus: 'live',
    retailPrice: '$32.00',
  },
};
