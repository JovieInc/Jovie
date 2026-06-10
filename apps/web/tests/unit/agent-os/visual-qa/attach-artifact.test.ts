import { describe, expect, it } from 'vitest';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { attachVisualQaDiffsToAgentRunArtifact } from '@/lib/agent-os/visual-qa/attach-artifact';
import type { VisualQaDiffRunSummary } from '@/lib/agent-os/visual-qa/diff-artifacts';

const baseArtifact: AgentRunArtifact = {
  id: 'agent-run-visual-qa',
  source: 'vercel-workflow',
  sourceRunId: 'demo-run',
  kind: 'design_review',
  status: 'running',
  title: 'Visual QA review',
  summary: 'Pending visual diff.',
  modelRoute: 'deterministic',
  allowedActions: ['read', 'summarize'],
  forbiddenActions: ['merge', 'deploy'],
  humanApprovalRequired: false,
  humanGate: {
    required: false,
    status: 'not_required',
    reason: null,
    reviewer: null,
    reviewedAt: null,
  },
  linearIssueId: 'JOV-1944',
  linearIssueUrl:
    'https://linear.app/jovie/issue/JOV-1944/compute-pixel-diffs-and-generate-diff-artifacts',
  pullRequestUrl: null,
  adminSurface: '/app/admin/ops',
  verificationGates: [
    {
      name: 'gstack.qa.exhaustive',
      required: true,
      status: 'missing',
      evidenceUrl: null,
      summary: 'Visual QA diff pending.',
      checkedAt: null,
    },
  ],
  costEstimate: {
    usd: 0,
    route: 'deterministic',
    inputTokens: null,
    outputTokens: null,
    notes: null,
  },
  blockedReason: null,
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
  metadata: {},
};

const passingSummary: VisualQaDiffRunSummary = {
  runId: 'demo-run',
  computedAt: '2026-06-08T00:05:00.000Z',
  passed: true,
  surfaces: [
    {
      surfaceId: 'shell-desktop-idle',
      title: 'Shell — desktop idle',
      baselinePath: 'shell-desktop-idle/baseline.png',
      afterPath: 'shell-desktop-idle/after.png',
      overlayPath: 'demo-run/shell-desktop-idle/diff-overlay.png',
      rawDiffRatio: 0,
      weightedDriftScore: 0,
      threshold: 0.08,
      status: 'no_significant_change',
      regionScores: [],
    },
  ],
};

describe('attachVisualQaDiffsToAgentRunArtifact', () => {
  it('attaches visual diff metadata and gate evidence to the artifact', () => {
    const artifact = attachVisualQaDiffsToAgentRunArtifact(
      baseArtifact,
      passingSummary,
      {
        artifactBaseUrl: 'https://artifacts.example.com/visual-qa',
      }
    );

    expect(artifact.metadata.visualQaDiff).toMatchObject({
      runId: 'demo-run',
      passed: true,
      diffSummaryPath: 'demo-run/diff-summary.json',
    });
    expect(artifact.verificationGates[0]).toMatchObject({
      name: 'gstack.qa.exhaustive',
      status: 'passed',
      artifactUrls: [
        'https://artifacts.example.com/visual-qa/demo-run/diff-summary.json',
      ],
    });
  });
});
