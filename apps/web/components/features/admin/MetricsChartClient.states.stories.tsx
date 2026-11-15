import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AdminUsagePoint } from '@/lib/admin/types';
import { MetricsChartClient } from './MetricsChartClient';

const usagePoints: AdminUsagePoint[] = [
  { label: 'Aug 18', value: 834 },
  { label: 'Aug 19', value: 902 },
];

const longUsagePoints: AdminUsagePoint[] = Array.from(
  { length: 90 },
  (_, index) => ({
    label: `Day ${index + 1}`,
    value: 1_000_000 + index * 12_345,
  })
);

/** State coverage for the admin daily-active-users chart; Populated lives in MetricsChartClient.stories.tsx. */
const meta = {
  title: 'Features/Admin/MetricsChartClient States',
  component: MetricsChartClient,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-4xl rounded-xl border border-subtle bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
  args: { points: usagePoints },
} satisfies Meta<typeof MetricsChartClient>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no usage observations yet, so the chart says so instead of plotting zero. */
export const EmptyNoUsage: Story = {
  args: { points: [] },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('No usage data available yet.')
    ).toBeVisible();
  },
};

/** Long content: ninety days of seven-figure counts. */
export const LongContentNinetyDays: Story = {
  args: { points: longUsagePoints },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText((2_098_705).toLocaleString())
    ).toBeVisible();
  },
};

/** Right-to-left: the chart and its stats inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Daily Active Users')
    ).toBeVisible();
  },
};
