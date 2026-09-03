import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReviewQueuePanel } from './ReviewQueuePanel';

const meta = {
  title: 'Features/Admin/Outreach/ReviewQueuePanel',
  component: ReviewQueuePanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['id', 'isSkipping', 'onSkip'],
    },
  },
} satisfies Meta<typeof ReviewQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
