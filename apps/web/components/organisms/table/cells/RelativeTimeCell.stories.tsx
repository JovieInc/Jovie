import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RelativeTimeCell } from './RelativeTimeCell';

const meta = {
  title: 'Design System/Data Grid/Cells/RelativeTimeCell',
  component: RelativeTimeCell,
  parameters: { layout: 'centered' },
  args: {
    value: '2026-11-17T12:00:00.000Z',
    nowMs: Date.parse('2026-11-20T12:00:00.000Z'),
  },
} satisfies Meta<typeof RelativeTimeCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
