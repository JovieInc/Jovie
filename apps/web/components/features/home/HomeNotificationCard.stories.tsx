import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeNotificationCard } from './HomeNotificationCard';

const meta = {
  title: 'Features/Home/HomeNotificationCard',
  component: HomeNotificationCard,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HomeNotificationCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
