import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { MetricsChart } from './MetricsChart';

const usagePoints: AdminUsagePoint[] = [
  { label: 'Aug 18', value: 834 },
  { label: 'Aug 19', value: 902 },
  { label: 'Aug 20', value: 876 },
  { label: 'Aug 21', value: 944 },
  { label: 'Aug 22', value: 1012 },
  { label: 'Aug 23', value: 1088 },
  { label: 'Aug 24', value: 1130 },
  { label: 'Aug 25', value: 1194 },
  { label: 'Aug 26', value: 1218 },
  { label: 'Aug 27', value: 1284 },
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

export const Empty: Story = {
  args: {
    points: [],
  },
};
