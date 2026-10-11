import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AgentRunArtifactSchema } from '@/lib/agent-os/artifact';
import { ArtifactDrawer } from './ArtifactDrawer';

const NOW = new Date('2026-01-15T12:00:00.000Z').toISOString();

// Real schema validation, so this fixture stays in lockstep with the
// AgentRunArtifact contract (the same shape agent-run-artifact PR comments use).
const artifact = AgentRunArtifactSchema.parse({
  id: 'run-1',
  source: 'github',
  sourceRunId: 'abc123',
  kind: 'code_review',
  status: 'done',
  title: 'Add stories for ranked feature components',
  summary:
    'Story-coverage batch touching 15 apps/web/components/features files.',
  modelRoute: 'claude-code',
  allowedActions: ['open_pr', 'ready_pr'],
  forbiddenActions: ['deploy'],
  humanApprovalRequired: false,
  humanGate: {
    required: false,
    status: 'not_required',
    reason: null,
    reviewer: null,
    reviewedAt: null,
  },
  linearIssueId: 'JOV-6778',
  linearIssueUrl: 'https://linear.app/jovieinc/issue/JOV-6778',
  pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/19385',
  adminSurface: null,
  verificationGates: [
    {
      name: 'github.ci',
      required: true,
      status: 'passed',
      evidenceUrl: null,
      summary: 'All checks passed.',
      checkedAt: NOW,
    },
  ],
  costEstimate: {
    usd: 0.42,
    route: 'claude-code',
    inputTokens: 120_000,
    outputTokens: 8_000,
    notes: null,
  },
  blockedReason: null,
  createdAt: NOW,
  updatedAt: NOW,
  metadata: {},
});

const meta = {
  title: 'Features/Admin/ArtifactDrawer',
  component: ArtifactDrawer,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ArtifactDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {
  args: {
    artifact,
  },
};

export const NoneSelected: Story = {
  args: {
    artifact: null,
  },
};
