import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ShippingVelocityCanvas } from './ShippingVelocityCanvas';

const dailyBuckets = [
  { date: '2026-09-01', merged: 2, opened: 4, closed: 1, mergeP50Hours: 3.5 },
  { date: '2026-09-02', merged: 3, opened: 5, closed: 0, mergeP50Hours: 4.1 },
  { date: '2026-09-03', merged: 1, opened: 2, closed: 1, mergeP50Hours: null },
];

const ninetyDays = Array.from({ length: 90 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 1 + index));
  return {
    date: date.toISOString().slice(0, 10),
    merged: 40 + (index % 17),
    opened: 55 + (index % 23),
    closed: index % 6,
    mergeP50Hours: index % 9 === 0 ? null : 1234.5 + index,
  };
});

/** State coverage for the shipping velocity canvas; the defaults live in ShippingVelocityCanvas.stories.tsx. */
const meta = {
  title: 'Features/Admin/ShippingVelocityCanvas States',
  component: ShippingVelocityCanvas,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-4xl rounded-xl border border-subtle bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    data: dailyBuckets,
    spotlight: null,
    showClosed: false,
    onLineClick: fn(),
    onChartClick: fn(),
  },
} satisfies Meta<typeof ShippingVelocityCanvas>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no pull requests in the window; the data table has headers and no rows. */
export const EmptyNoPullRequests: Story = {
  args: { data: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('View daily data and lead time'));
    await expect(canvas.getAllByRole('row')).toHaveLength(1);
  },
};

/** Long content: ninety days of data open in the scrolling table. */
export const LongContentNinetyDays: Story = {
  args: { data: ninetyDays, spotlight: 'merged', showClosed: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('View daily data and lead time'));
    await expect(canvas.getAllByRole('row')).toHaveLength(91);
  },
};

/** Right-to-left: the chart and its data table inside an RTL document. */
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
      within(canvasElement).getByRole('img', {
        name: 'Daily GitHub Pull Request Counts. Full Data Follows.',
      })
    ).toBeInTheDocument();
  },
};
