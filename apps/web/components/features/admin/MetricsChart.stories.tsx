import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { MetricsChart } from './MetricsChart';

const usagePoints: AdminUsagePoint[] = [
  { label: 'Aug 18', value: 834 },
  { label: 'Aug 19', value: 902 },
];

const meta = {
  title: 'Features/Admin/MetricsChart',
  component: MetricsChart,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['loading'],
    },
  },
  decorators: [
    Story => (
      <div className='w-full max-w-4xl rounded-xl border border-subtle bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    points: usagePoints,
  },
} satisfies Meta<typeof MetricsChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
