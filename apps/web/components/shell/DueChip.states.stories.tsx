import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { DueChip } from './DueChip';

const NOW = new Date('2026-09-29T12:00:00.000Z');

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const narrow: Decorator = function NarrowRow(Story) {
  return (
    <div className='flex w-24 items-center gap-1'>
      <Story />
    </div>
  );
};

/** State coverage for the due chip; DueSoon, DueToday, Overdue and Muted live in DueChip.stories.tsx. */
const meta = {
  title: 'Shell/DueChip States',
  component: DueChip,
  parameters: { layout: 'centered' },
  args: { now: NOW, dueIso: '2026-10-02T12:00:00.000Z' },
} satisfies Meta<typeof DueChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: an unparseable due date renders no chip at all. */
export const EmptyInvalidDate: Story = {
  args: { dueIso: 'not-a-date' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/Due/)).toBeNull();
  },
};

/** Partial: a far-off due date with no tone override reads as the neutral relative label. */
export const PartialNeutralTone: Story = {
  args: { dueIso: '2026-10-20T12:00:00.000Z' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Due in 3w')).toBeVisible();
  },
};

/** Long content: a year-scale date falls back to the longest absolute label in a narrow row. */
export const LongContentAbsoluteDate: Story = {
  args: { dueIso: '2028-12-31T12:00:00.000Z' },
  decorators: [narrow],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Dec 31, 2028')).toBeVisible();
  },
};

/** Right-to-left: the chip inside an RTL row. */
export const RtlDocument: Story = {
  decorators: [rtl],
};
