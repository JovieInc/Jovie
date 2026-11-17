import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { Sparkline } from './Sparkline';

const card: Decorator = function ChartCard(Story) {
  return (
    <div className='w-80 bg-base p-3'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 bg-base p-3'>
      <Story />
    </div>
  );
};

const YEAR = Array.from(
  { length: 365 },
  (_, i) => 40 + Math.round(18 * Math.sin(i / 9) + i / 6)
);

/** State coverage for the sparkline; Up, Down, Flat and WithHover live in Sparkline.stories.tsx. */
const meta = {
  title: 'Shell/Sparkline States',
  component: Sparkline,
  parameters: { layout: 'centered' },
  decorators: [card],
  args: { points: [12, 14, 11, 18, 22, 19, 24], trend: 'up', onHover: fn() },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no points yet draws an empty, still-labelled chart frame. */
export const EmptyNoPoints: Story = {
  args: { points: [], trend: 'flat', ariaLabel: 'No clicks yet' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'No clicks yet' })
    ).toBeInTheDocument();
  },
};

/** Partial: a single point collapses to the chart centre. */
export const PartialSinglePoint: Story = {
  args: { points: [9], trend: 'flat', hoverIdx: 0 },
};

/** Long content: a full year of daily points in one chart. */
export const LongContentYearOfPoints: Story = {
  args: { points: YEAR, trend: 'up', hoverIdx: 200 },
};

/** Right-to-left: the chart keeps its left-to-right time axis in an RTL card. */
export const RtlDocument: Story = {
  args: { ariaLabel: 'النقرات عبر الزمن' },
  decorators: [rtl],
};
