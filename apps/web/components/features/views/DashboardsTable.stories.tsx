import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardsTable } from './DashboardsTable';

const meta = {
  title: 'Features/Views/DashboardsTable',
  component: DashboardsTable,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    rows: [
      {
        id: '1',
        title: 'Weekly snapshot',
        token: 'a'.repeat(32),
        source: 'agent',
        updatedAt: '2026-11-22T00:00:00.000Z',
      },
      {
        id: '2',
        title: 'Fan growth by city',
        token: 'b'.repeat(32),
        source: 'user',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
    ],
  },
} satisfies Meta<typeof DashboardsTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { rows: [] } };
