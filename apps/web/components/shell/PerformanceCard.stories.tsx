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

export const Default: Story = {};
