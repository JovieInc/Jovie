import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  composeOvieActivityFeed,
  type OvieActivityFeed,
} from '@/lib/hud/ovie-activity-feed';
import type { OperationalTask } from '@/lib/ovie/shipping-state';
import { OvieActivityFeedPanelView } from './OvieActivityFeedPanel';

const RECEIPT = {
  linearIssue: 'JOV-5322',
  symphonyRef: 'symphony-task-9',
  mergeQueueRef: 'MQ-4',
  prodSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  receiptAt: '2026-09-25T10:00:00.000Z',
};

const RUNNING_TASK: OperationalTask = {
  id: 'linear:JOV-5000',
  linearIdentifier: 'JOV-5000',
  linearUrl: 'https://linear.app/jovie/issue/JOV-5000',
  title: 'Release the inbox redesign',
  workflowState: 'running',
  priority: 'high',
  attempt: 1,
  retryAt: null,
  sourceRevision: null,
  updatedAt: '2026-09-26T08:00:00.000Z',
};

const liveFeed: OvieActivityFeed = composeOvieActivityFeed({
  operational: { syncState: 'fresh', tasks: [RUNNING_TASK] },
  receipts: [RECEIPT],
  receiptsAvailable: true,
  publicUpdates: [
    {
      title: 'Faster profile editing',
      date: '2026-09-24',
      url: '/changelog',
    },
  ],
});

const syncingFeed: OvieActivityFeed = composeOvieActivityFeed({
  operational: { syncState: 'syncing', tasks: [] },
  receipts: [],
  receiptsAvailable: false,
  publicUpdates: [],
});

const unavailableFeed: OvieActivityFeed = composeOvieActivityFeed({
  operational: { syncState: 'failed', tasks: [] },
  receipts: [],
  receiptsAvailable: false,
  publicUpdates: [],
});

const meta = {
  title: 'Features/Admin/Hud/OvieActivityFeedPanel',
  component: OvieActivityFeedPanelView,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OvieActivityFeedPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Live: Story = {
  args: { feed: liveFeed },
};

export const Syncing: Story = {
  args: { feed: syncingFeed },
};

export const Unavailable: Story = {
  args: { feed: unavailableFeed },
};
