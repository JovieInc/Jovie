import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseTaskDueBadge } from './ReleaseTaskDueBadge';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

const meta = {
  title: 'Dashboard/ReleaseTasks/ReleaseTaskDueBadge',
  component: ReleaseTaskDueBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    dueDate: daysFromNow(14),
    dueDaysOffset: 14,
  },
} satisfies Meta<typeof ReleaseTaskDueBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Future: Story = {};

export const DueSoon: Story = {
  args: {
    dueDate: daysFromNow(2),
    dueDaysOffset: 2,
  },
};

export const Completed: Story = {
  args: {
    isCompleted: true,
  },
};

export const NoDate: Story = {
  args: {
    dueDate: null,
    dueDaysOffset: null,
    onSetDate: () => {},
  },
};
