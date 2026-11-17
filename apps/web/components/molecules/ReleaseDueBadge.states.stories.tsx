import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { ReleaseDueBadge, ReleaseDueClockContext } from './ReleaseDueBadge';

const FIXED_NOW = new Date('2030-05-20T12:00:00.000Z');

function daysFrom(days: number): Date {
  return new Date(FIXED_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

function FixedClockDecorator(Story: () => ReactNode) {
  return (
    <ReleaseDueClockContext.Provider value={FIXED_NOW}>
      <Story />
    </ReleaseDueClockContext.Provider>
  );
}

function RtlFixedClockDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <ReleaseDueClockContext.Provider value={FIXED_NOW}>
        <Story />
      </ReleaseDueClockContext.Provider>
    </div>
  );
}

const meta = {
  title: 'Molecules/ReleaseDueBadge/States',
  component: ReleaseDueBadge,
  parameters: { layout: 'centered' },
  decorators: [FixedClockDecorator],
  args: {
    dueDate: daysFrom(14),
    dueDaysOffset: 14,
  },
} satisfies Meta<typeof ReleaseDueBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no due date and no offset, so nothing renders. */
export const EmptyNoDueDate: Story = {
  args: { dueDate: null, dueDaysOffset: null },
};

/** Error: an overdue task shows the error-toned badge. */
export const ErrorOverdue: Story = {
  args: { dueDate: daysFrom(-5), dueDaysOffset: -5 },
};

/** Partial: an offset without a date offers the set-date action. */
export const PartialSetDatePrompt: Story = {
  args: { dueDate: null, dueDaysOffset: 7, onSetDate: fn() },
};

/** Long content: a far-future date gives the widest day count. */
export const LongContentFarFuture: Story = {
  args: { dueDate: daysFrom(1200), dueDaysOffset: 1200 },
};

/** RTL: a due-soon badge in a right-to-left row. */
export const RtlDueSoon: Story = {
  args: { dueDate: daysFrom(2), dueDaysOffset: 2 },
  decorators: [RtlFixedClockDecorator],
};
