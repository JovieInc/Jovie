import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { composeCompanyActivity } from '@/lib/hud/company-activity';
import { CompanyActivityFeedView } from './CompanyActivityFeed';

const feed = composeCompanyActivity({
  operationalTasks: {
    canonicalSource: 'linear',
    cacheMode: 'local-reconciled',
    syncState: 'fresh',
    sourceId: 'symphony-runtime',
    observedAt: '2026-09-26T10:00:00.000Z',
    lastSyncedAt: '2026-09-26T10:00:00.000Z',
    freshnessDeadline: '2026-09-26T10:00:10.000Z',
    tasks: [
      {
        id: 'linear:JOV-5322',
        linearIdentifier: 'JOV-5322',
        linearUrl: 'https://linear.app/jovie/issue/JOV-5322/feed',
        title: 'Company activity feed',
        workflowState: 'running',
        priority: 'high',
        attempt: null,
        retryAt: null,
        sourceRevision: null,
        updatedAt: '2026-09-26T10:00:00.000Z',
      },
    ],
    deltas: [],
  },
  pullRequests: {
    availability: 'available',
    totalOpen: 1,
    items: [
      {
        number: 18684,
        title: 'feat(hud): activity feed',
        url: 'https://github.com/JovieInc/Jovie/pull/18684',
        headRefName: 'devin/jov-5322-x',
        authorLogin: 'devin-ai-integration',
        updatedAtIso: '2026-09-26T09:00:00.000Z',
        status: 'merge_queue',
        statusLabel: 'MQ',
        statusDetail: 'Position 2',
        mergeQueuePosition: 2,
      },
    ],
    truncated: false,
    errorMessage: null,
  },
  receiptsAvailable: true,
  receiptedShips: [],
  publicDigest: null,
});

const meta = {
  title: 'Features/Admin/Hud/CompanyActivityFeed',
  component: CompanyActivityFeedView,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CompanyActivityFeedView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { feed } };

export const Empty: Story = {
  args: {
    feed: composeCompanyActivity({
      operationalTasks: null,
      pullRequests: {
        availability: 'error',
        totalOpen: 0,
        items: [],
        truncated: false,
        errorMessage: 'GitHub API error (502)',
      },
      receiptsAvailable: false,
      publicDigest: null,
    }),
  },
};
