import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { WeeklyTrendChart } from './WeeklyTrendChart';

type Week = Parameters<typeof WeeklyTrendChart>[0]['data'][number];

const week = (index: number, scale = 1): Week => {
  const start = new Date(Date.UTC(2026, 0, 5 + index * 7));
  return {
    weekStart: start.toISOString().slice(0, 10),
    scraped: (420 + index * 13) * scale,
    contacted: (180 + index * 7) * scale,
    signups: (24 + index * 2) * scale,
    paid: (3 + (index % 4)) * scale,
  };
};

/** Weekly outreach trend: scraped, contacted, signups and paid per week. */
const meta = {
  title: 'Features/Admin/WeeklyTrendChart',
  component: WeeklyTrendChart,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-full max-w-3xl rounded-xl border border-subtle bg-surface-1 p-4'>
        <Story />
      </div>
    ),
  ],
  args: { data: Array.from({ length: 8 }, (_, i) => week(i)) },
} satisfies Meta<typeof WeeklyTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: no weeks recorded yet; the legend still names every series. */
export const EmptyNoWeeks: Story = {
  args: { data: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Scraped')).toBeVisible();
  },
};

/** Long content: a full year of weeks with large counts. */
export const LongContentFullYear: Story = {
  args: { data: Array.from({ length: 52 }, (_, i) => week(i, 1000)) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId('weekly-trend-chart')
    ).toBeVisible();
  },
};

/** Right-to-left: the chart and legend inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Paid')).toBeVisible();
  },
};
