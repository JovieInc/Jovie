import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { FounderFunnelDrilldown } from './FounderFunnelDrilldown';

const result: FounderFunnelStageRows = {
  stage: 'accounts_created',
  stageLabel: 'Accounts created',
  stageDescription: 'Created an account',
  timeRange: '30d',
  total: 3,
  rows: [
    {
      id: 'u1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      enteredAt: '2026-09-28T12:00:00.000Z',
    },
    {
      id: 'u2',
      displayName: 'Grace Hopper',
      email: 'grace@example.com',
      enteredAt: '2026-09-25T09:30:00.000Z',
    },
    {
      id: 'u3',
      displayName: null,
      email: 'anon@example.com',
      enteredAt: '2026-09-22T18:45:00.000Z',
    },
  ],
  limit: 100,
  errors: [],
  definitionVersion: 'founder-funnel.v2',
};

const meta = {
  title: 'Features/Admin/Hud/FounderFunnelDrilldown',
  component: FounderFunnelDrilldown,
  args: { result },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FounderFunnelDrilldown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { result: { ...result, total: 0, rows: [] } },
};

export const WithErrors: Story = {
  args: { result: { ...result, errors: ['stage query failed'] } },
};
