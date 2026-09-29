import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DueChip } from './DueChip';

const NOW = new Date('2026-09-29T12:00:00.000Z');

const meta = {
  title: 'Shell/DueChip',
  component: DueChip,
  parameters: {
    layout: 'centered',
  },
  args: {
    now: NOW,
    dueIso: '2026-10-02T12:00:00.000Z',
  },
} satisfies Meta<typeof DueChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DueSoon: Story = {};

export const DueToday: Story = {
  args: {
    dueIso: NOW.toISOString(),
  },
};

export const Overdue: Story = {
  args: {
    dueIso: '2026-09-25T12:00:00.000Z',
  },
};

export const Muted: Story = {
  args: {
    muted: true,
  },
};
