import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OvieActivityFeed as Feed } from '@/lib/hud/ovie-activity-feed';
import { OvieActivityFeed } from './OvieActivityFeed';

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    availability: 'available',
    truncated: false,
    rows: [
      {
        id: 'task:linear:JOV-5322',
        source: 'linear',
        state: 'in-progress',
        stateLabel: 'In Progress',
        title: 'Company activity feed under Mac HUD heroes',
        actor: 'Symphony',
        linearIdentifier: 'JOV-5322',
        linearUrl: 'https://linear.app/jovie/issue/JOV-5322',
        prUrl: 'https://github.com/jovie/jovie/pull/18665',
        digestUrl: null,
        detail: 'Symphony runtime active',
        updatedAtIso: '2026-09-26T09:00:00.000Z',
        freshness: 'fresh',
      },
      {
        id: 'receipt:JOV-1:abc1234567890abcdef',
        source: 'deploy-receipt',
        state: 'deployed',
        stateLabel: 'Deployed',
        title: 'JOV-1 deployed',
        actor: 'dogfood receipt',
        linearIdentifier: 'JOV-1',
        linearUrl: null,
        prUrl: null,
        digestUrl: null,
        detail: 'prod abc1234 · receipted 2026-09-26T00:00:00.000Z',
        updatedAtIso: '2026-09-26T00:00:00.000Z',
        freshness: 'fresh',
      },
      {
        id: 'digest:ship-1-0-0-0',
        source: 'public-digest',
        state: 'publicly-available',
        stateLabel: "What's New",
        title: 'Ship things',
        actor: 'public digest',
        linearIdentifier: null,
        linearUrl: null,
        prUrl: null,
        digestUrl: '/changelog#ship-1-0-0-0',
        detail: '2026-09-25 · v1.0.0',
        updatedAtIso: null,
        freshness: 'fresh',
      },
      {
        id: 'pr:18640',
        source: 'github',
        state: 'blocked',
        stateLabel: 'Blocked',
        title: 'Harden shipping-state poller retries',
        actor: 'ovie',
        linearIdentifier: 'JOV-5480',
        linearUrl: 'https://linear.app/jovie/issue/JOV-5480',
        prUrl: 'https://github.com/jovie/jovie/pull/18640',
        digestUrl: null,
        detail: 'CI red · merge queue hold',
        updatedAtIso: '2026-09-25T18:00:00.000Z',
        freshness: 'stale',
      },
    ],
    ...overrides,
  };
}

const meta = {
  title: 'Features/Admin/Hud/OvieActivityFeed',
  component: OvieActivityFeed,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof OvieActivityFeed>;
export default meta;
type Story = StoryObj<typeof OvieActivityFeed>;

export const Populated: Story = {
  args: { feed: feed() },
};

export const Truncated: Story = {
  args: { feed: feed({ truncated: true }) },
};

export const EmptyAvailable: Story = {
  args: { feed: feed({ rows: [] }) },
};

export const NotConfigured: Story = {
  args: {
    feed: { availability: 'not_configured', rows: [], truncated: false },
  },
};
