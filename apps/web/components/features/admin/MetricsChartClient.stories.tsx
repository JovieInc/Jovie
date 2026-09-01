import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { MetricsChartClient } from './MetricsChartClient';

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
  title: 'Features/Admin/MetricsChartClient',
  component: MetricsChartClient,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-[min(52rem,calc(100vw-2rem))] rounded-xl border border-subtle bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    points: usagePoints,
  },
} satisfies Meta<typeof MetricsChartClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
