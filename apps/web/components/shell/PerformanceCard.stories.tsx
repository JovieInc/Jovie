import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PerformanceCard } from './PerformanceCard';

const meta = {
  title: 'Shell/PerformanceCard',
  component: PerformanceCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'title',
        'metricLabel',
        'pointsByRange',
        'trend',
        'delta',
      ],
    },
  },
} satisfies Meta<typeof PerformanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Smart Link',
    metricLabel: 'clicks',
    pointsByRange: {
      '7d': [120, 132, 101, 154, 190, 172, 210],
      '30d': [90, 110, 105, 130, 140, 150, 172, 210],
    },
    trend: 'up',
    delta: 12.4,
  },
};
