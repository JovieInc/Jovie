import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ReleaseDueBadge } from './ReleaseDueBadge';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

const meta = {
  title: 'Molecules/ReleaseDueBadge',
  component: ReleaseDueBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    dueDate: daysFromNow(14),
    dueDaysOffset: 14,
  },
} satisfies Meta<typeof ReleaseDueBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Future: Story = {};

export const DueSoon: Story = {
  args: {
    dueDate: daysFromNow(2),
    dueDaysOffset: 2,
  },
};

export const DueToday: Story = {
  args: {
    dueDate: daysFromNow(0),
    dueDaysOffset: 0,
  },
};

export const Overdue: Story = {
  args: {
    dueDate: daysFromNow(-5),
    dueDaysOffset: -5,
  },
};

export const StaleOverdue: Story = {
  args: {
    dueDate: daysFromNow(-120),
    dueDaysOffset: -120,
  },
};

export const NoDateSet: Story = {
  args: {
    dueDate: null,
    dueDaysOffset: 7,
    onSetDate: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Set date',
    });
    await userEvent.click(trigger);
    await expect(args.onSetDate).toHaveBeenCalled();
  },
};

export const Completed: Story = {
  args: {
    isCompleted: true,
  },
};
