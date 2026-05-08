import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import {
  evaluateAgentRunGateEvidence,
  formatAgentRunArtifactComment,
} from '@/lib/agent-os/gate-evidence';

const baseArtifact: AgentRunArtifact = {
  id: 'run-gstack-1',
  source: 'github',
  sourceRunId: '123',
  kind: 'qa',
  status: 'done',
  title: 'GStack gates',
  summary: 'Recorded GStack gate evidence.',
  modelRoute: 'deterministic',
  allowedActions: ['read'],
  forbiddenActions: ['merge', 'deploy'],
  humanApprovalRequired: false,
  humanGate: {
    required: false,
    status: 'not_required',
    reason: null,
    reviewer: null,
    reviewedAt: null,
  },
  linearIssueId: 'JOV-1926',
  linearIssueUrl: 'https://linear.app/jovie/issue/JOV-1926/test',
  pullRequestUrl: 'https://github.com/JovieInc/Jovie/pull/1',
  adminSurface: APP_ROUTES.ADMIN_OPS,
  verificationGates: [
    {
      name: 'gstack.qa.exhaustive',
      required: true,
      status: 'passed',
      evidenceUrl: null,
      summary: '/qa --exhaustive passed',
      checkedAt: '2026-05-08T04:00:00.000Z',
    },
    {
      name: 'gstack.review',
      required: true,
      status: 'passed',
      evidenceUrl: null,
      summary: '/review passed',
      checkedAt: '2026-05-08T04:01:00.000Z',
    },
    {
      name: 'gstack.ship',
      required: true,
      status: 'passed',
      evidenceUrl: null,
      summary: '/ship passed',
      checkedAt: '2026-05-08T04:02:00.000Z',
    },
  ],
  costEstimate: {
    usd: 0,
    route: 'deterministic',
    inputTokens: 0,
    outputTokens: 0,
    notes: null,
  },
  blockedReason: null,
  createdAt: '2026-05-08T04:00:00.000Z',
  updatedAt: '2026-05-08T04:02:00.000Z',
  metadata: {},
};

describe('AgentOS gate evidence', () => {
  it('passes when all required GStack gates have recorded evidence', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      formatAgentRunArtifactComment(baseArtifact)
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.missingGateNames).toEqual([]);
    expect(evaluation.passedGateNames).toEqual([
      'gstack.qa.exhaustive',
      'gstack.review',
      'gstack.ship',
    ]);
  });

  it('reports missing gates when evidence is absent or not passed', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      formatAgentRunArtifactComment({
        ...baseArtifact,
        verificationGates: [
          {
            name: 'gstack.qa.exhaustive',
            required: true,
            status: 'failed',
            evidenceUrl: null,
            summary: '/qa --exhaustive failed',
            checkedAt: '2026-05-08T04:00:00.000Z',
          },
        ],
      })
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.missingGateNames).toEqual([
      'gstack.qa.exhaustive',
      'gstack.review',
      'gstack.ship',
    ]);
  });

  it('ignores malformed artifact comments', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      '<!-- agent-run-artifact\nnot json\n-->'
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.artifacts).toEqual([]);
  });

  it('continues after malformed artifact comments', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      [
        '<!-- agent-run-artifact',
        'not json',
        '-->',
        formatAgentRunArtifactComment(baseArtifact),
      ].join('\n')
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.artifacts).toHaveLength(1);
  });

  it('parses artifact comments when JSON strings contain comment terminators', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      formatAgentRunArtifactComment({
        ...baseArtifact,
        summary: 'Recorded marker --> without ending the artifact.',
      })
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.artifacts).toHaveLength(1);
  });

  it('accepts summary evidence when evidenceUrl is an empty string', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      formatAgentRunArtifactComment({
        ...baseArtifact,
        verificationGates: baseArtifact.verificationGates.map(gate => ({
          ...gate,
          evidenceUrl: '',
        })),
      })
    );

    expect(evaluation.passed).toBe(true);
  });
});
