import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CompanyActivityRow } from '@/lib/hud/company-activity';
import { CompanyActivityFeedView } from './CompanyActivityFeed';

function row(overrides: Partial<CompanyActivityRow> = {}): CompanyActivityRow {
  return {
    id: 'linear:JOV-5544',
    source: 'linear',
    actor: 'symphony',
    linearIdentifier: 'JOV-5544',
    title: 'Cache Symphony workspaces',
    state: 'in-progress',
    href: 'https://linear.app/jovie/issue/JOV-5544/x',
    receipt: null,
    observedAt: '2026-09-21T00:00:00.000Z',
    freshness: 'fresh',
    ...overrides,
  };
}

const meta = {
  title: 'Features/Admin/Hud/CompanyActivityFeed',
  component: CompanyActivityFeedView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CompanyActivityFeedView>;
export default meta;
type Story = StoryObj<typeof CompanyActivityFeedView>;

export const MixedActivity: Story = {
  args: {
    rows: [
      row(),
      row({
        id: 'pr:18678',
        source: 'github',
        actor: 'github',
        linearIdentifier: 'JOV-5322',
        title: 'feat(hud): company activity feed',
        state: 'merge-queued',
        href: 'https://github.com/JovieInc/Jovie/pull/18678',
      }),
      row({
        id: 'receipt:abc123',
        source: 'symphony-runtime',
        linearIdentifier: 'JOV-5298',
        title: 'Verified ship receipt',
        state: 'deployed',
        href: null,
        receipt: 'aaaaaaa',
      }),
      row({
        id: 'digest:1-2-3',
        source: 'public-digest',
        actor: 'curated',
        linearIdentifier: null,
        title: 'Smarter release digests',
        state: 'publicly-available',
        href: '/changelog/1.2.3',
      }),
      row({
        id: 'linear:JOV-5600',
        linearIdentifier: 'JOV-5600',
        title: 'Blocked on upstream quota',
        state: 'blocked',
        href: null,
      }),
    ],
    syncLabel: 'Fresh',
    syncTone: 'good',
  },
};

export const StaleFeed: Story = {
  args: {
    rows: [row()],
    syncLabel: 'Stale',
    syncTone: 'warning',
  },
};

export const SyncFailed: Story = {
  args: {
    rows: [row({ state: 'failed', title: 'Failed runtime task' })],
    syncLabel: 'Sync Failed',
    syncTone: 'bad',
  },
};

export const Empty: Story = {
  args: {
    rows: [],
    syncLabel: 'Unknown',
    syncTone: 'neutral',
  },
};
