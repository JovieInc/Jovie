import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ShippingVelocityCanvas } from './ShippingVelocityCanvas';

const dailyBuckets = [
  { date: '2026-09-01', merged: 2, opened: 4, closed: 1, mergeP50Hours: 3.5 },
  { date: '2026-09-02', merged: 3, opened: 5, closed: 0, mergeP50Hours: 4.1 },
  { date: '2026-09-03', merged: 1, opened: 2, closed: 1, mergeP50Hours: null },
];

const meta = {
  title: 'Features/Admin/ShippingVelocityCanvas',
  component: ShippingVelocityCanvas,
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
    data: dailyBuckets,
    spotlight: null,
    showClosed: false,
    onLineClick: () => undefined,
    onChartClick: () => undefined,
  },
} satisfies Meta<typeof ShippingVelocityCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DailyShippingCounts: Story = {};

export const ClosedPullRequestsVisible: Story = {
  args: { showClosed: true },
};
