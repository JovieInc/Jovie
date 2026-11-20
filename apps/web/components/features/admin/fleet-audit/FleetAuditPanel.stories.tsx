import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FleetAuditPanel } from './FleetAuditPanel';

const event = {
  id: 'e1',
  ts: '2026-10-29T10:00:00.000Z',
  actor_agent: 'claude-lane-3',
  session_id: null,
  host: 'gem',
  repo: 'JovieInc/Jovie',
  target: 'JovieInc/Jovie#123',
  action: 'pr.merge',
  danger: 1 as const,
  reason: 'queue drained',
  issue: null,
  outcome: 'ok',
  before: null,
  after: null,
  source: 'gh-shim' as const,
};

const meta = {
  title: 'Admin/Fleet Audit/Panel',
  component: FleetAuditPanel,
  parameters: { layout: 'padded' },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FleetAuditPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {
  args: {
    initial: {
      state: 'ok',
      data: {
        budget: { bytes_month: 25_000, limit_bytes: 100_000, pct: 25 },
        dangerous: [event],
        unattributed: [
          {
            id: 'c1',
            observed_at: '2026-10-29T11:00:00.000Z',
            repo: 'JovieInc/Jovie',
            target: 'JovieInc/Jovie#124',
            change: 'label.add',
            github_actor: 'itstimwhite',
            matched_event_id: null,
            status: 'unattributed',
          },
        ],
        counts: { events_24h: 41, events_7d: 290 },
      },
    },
  },
};

export const NotConfigured: Story = {
  args: { initial: { state: 'not_configured' } },
};

export const Unavailable: Story = {
  args: { initial: { state: 'unavailable' } },
};
