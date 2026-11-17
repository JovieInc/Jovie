import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import CalendarInner from './CalendarInner';

/** Rendered states of the themed day picker, beside CalendarInner.stories.tsx. */
const meta = {
  title: 'Atoms/CalendarInner States',
  component: CalendarInner,
  parameters: {
    layout: 'centered',
  },
  args: {
    mode: 'single',
    defaultMonth: new Date('2026-01-01T12:00:00.000Z'),
  },
} satisfies Meta<typeof CalendarInner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing selected yet, so no day carries the selected fill. */
export const EmptyNoSelection: Story = {
  args: {
    onSelect: fn(),
  },
};

/** Long content: a range across two visible months. */
export const ManyMonthsRange: Story = {
  args: {
    mode: 'range',
    numberOfMonths: 2,
    selected: {
      from: new Date('2026-01-24T12:00:00.000Z'),
      to: new Date('2026-02-09T12:00:00.000Z'),
    },
    onSelect: fn(),
  },
};

/** Right-to-left: the grid and month navigation mirror for an Arabic page. */
export const RtlArabicPage: Story = {
  args: {
    dir: 'rtl',
    selected: new Date('2026-01-15T12:00:00.000Z'),
    onSelect: fn(),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
