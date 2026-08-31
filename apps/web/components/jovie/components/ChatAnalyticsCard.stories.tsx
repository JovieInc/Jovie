import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChatAnalyticsCard } from './ChatAnalyticsCard';

const meta = {
  title: 'Jovie/Components/ChatAnalyticsCard',
  component: ChatAnalyticsCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['result'],
    },
  },
} satisfies Meta<typeof ChatAnalyticsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
