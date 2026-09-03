import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReliabilityCard } from './ReliabilityCard';

const meta = {
  title: 'Features/Admin/ReliabilityCard',
  component: ReliabilityCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['summary'],
    },
  },
} satisfies Meta<typeof ReliabilityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
