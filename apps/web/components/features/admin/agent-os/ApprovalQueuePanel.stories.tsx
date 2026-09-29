import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRunArtifactSchema } from '@/lib/agent-os/artifact';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';

const NOW = new Date('2026-01-15T12:00:00.000Z').toISOString();

// Real schema validation, so this fixture stays in lockstep with the
// AgentRunArtifact contract (the same shape agent-run-artifact PR comments use).
const artifact = AgentRunArtifactSchema.parse({
  id: 'run-1',
  source: 'github',
  sourceRunId: 'abc123',
  kind: 'code_review',
  status: 'review',
  title: 'Add stories for ranked feature components',
  summary:
    'Story-coverage batch touching 15 apps/web/components/features files.',
  modelRoute: 'claude-code',
  allowedActions: ['open_pr', 'ready_pr'],
  forbiddenActions: ['deploy'],
  humanApprovalRequired: true,
  humanGate: {
    required: true,
    status: 'pending',
    reason: null,
    reviewer: null,
    reviewedAt: null,
  },
  linearIssueId: null,
  linearIssueUrl: null,
  pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/19385',
  adminSurface: null,
  verificationGates: [],
  costEstimate: null,
  blockedReason: null,
  createdAt: NOW,
  updatedAt: NOW,
  metadata: {},
});

const meta = {
  title: 'Features/Admin/ApprovalQueuePanel',
  component: ApprovalQueuePanel,
  parameters: {
    layout: 'centered',
  },
  args: {
    selectedId: null,
    onSelect: () => {},
  },
} satisfies Meta<typeof ApprovalQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingApproval: Story = {
  args: {
    artifacts: [artifact],
  },
};

export const Empty: Story = {
  args: {
    artifacts: [],
  },
};
