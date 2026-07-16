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
    expect(evaluation.artifactIssues).toEqual([
      expect.objectContaining({ kind: 'malformed-json' }),
    ]);
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

    expect(evaluation.passed).toBe(false);
    expect(evaluation.artifacts).toHaveLength(1);
    expect(evaluation.artifactIssues).toHaveLength(1);
  });

  it('continues after schema-invalid artifact comments', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      [
        '<!-- agent-run-artifact',
        '{ "id": "schema-invalid-only" }',
        '-->',
        formatAgentRunArtifactComment(baseArtifact),
      ].join('\n')
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.artifacts).toHaveLength(1);
    expect(evaluation.artifactIssues).toEqual([
      expect.objectContaining({ kind: 'schema-invalid' }),
    ]);
  });

  it('reports exact invalid route and action paths instead of only missing gates', () => {
    const invalid = JSON.stringify({
      ...baseArtifact,
      modelRoute: 'codex',
      forbiddenActions: ['merge', 'mutate_ruleset'],
    });
    const evaluation = evaluateAgentRunGateEvidence(
      `<!-- agent-run-artifact\n${invalid}\n-->`,
      undefined,
      { sourceRunId: '123' }
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.artifactIssues[0]?.details).toEqual(
      expect.arrayContaining([
        expect.stringContaining('modelRoute'),
        expect.stringContaining('forbiddenActions.1'),
      ])
    );
  });

  it('does not let a stale invalid artifact block exact-head evidence', () => {
    const stale = JSON.stringify({
      ...baseArtifact,
      sourceRunId: 'stale-sha',
      modelRoute: 'codex',
    });
    const evaluation = evaluateAgentRunGateEvidence(
      [
        `<!-- agent-run-artifact\n${stale}\n-->`,
        formatAgentRunArtifactComment({
          ...baseArtifact,
          sourceRunId: 'current-sha',
        }),
      ].join('\n'),
      undefined,
      { sourceRunId: 'current-sha' }
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.artifactIssues).toEqual([]);
  });

  it('continues after unclosed malformed artifact comments', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      [
        '<!-- agent-run-artifact',
        '{ "summary": "unterminated"',
        formatAgentRunArtifactComment(baseArtifact),
      ].join('\n')
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.artifacts).toHaveLength(1);
    expect(evaluation.artifactIssues).toHaveLength(1);
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

  it('parses artifact comments when JSON strings contain artifact start markers', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      formatAgentRunArtifactComment({
        ...baseArtifact,
        summary:
          'Recorded marker <!-- agent-run-artifact without starting a nested artifact.',
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

  it('accepts uploaded artifact URLs as gate evidence', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      formatAgentRunArtifactComment({
        ...baseArtifact,
        verificationGates: baseArtifact.verificationGates.map(gate => ({
          ...gate,
          evidenceUrl: null,
          artifactUrls: [
            'https://github.com/JovieInc/Jovie/actions/runs/123/artifacts/456',
          ],
          summary: null,
        })),
      })
    );

    expect(evaluation.passed).toBe(true);
  });

  it('can require evidence from the current source run', () => {
    const markdown = [
      formatAgentRunArtifactComment(baseArtifact),
      formatAgentRunArtifactComment({
        ...baseArtifact,
        id: 'run-gstack-current',
        sourceRunId: 'current-sha',
      }),
    ].join('\n');

    const currentEvaluation = evaluateAgentRunGateEvidence(
      markdown,
      undefined,
      {
        sourceRunId: 'current-sha',
      }
    );
    const missingEvaluation = evaluateAgentRunGateEvidence(
      markdown,
      undefined,
      {
        sourceRunId: 'missing-sha',
      }
    );

    expect(currentEvaluation.passed).toBe(true);
    expect(currentEvaluation.artifacts).toHaveLength(1);
    expect(missingEvaluation.passed).toBe(false);
    expect(missingEvaluation.artifacts).toEqual([]);
  });

  it('uses the latest gate evidence state for each required gate', () => {
    const evaluation = evaluateAgentRunGateEvidence(
      [
        formatAgentRunArtifactComment(baseArtifact),
        formatAgentRunArtifactComment({
          ...baseArtifact,
          id: 'run-gstack-2',
          verificationGates: [
            {
              name: 'gstack.qa.exhaustive',
              required: true,
              status: 'failed',
              evidenceUrl: null,
              summary: '/qa --exhaustive failed',
              checkedAt: '2026-05-08T05:00:00.000Z',
            },
          ],
          updatedAt: '2026-05-08T05:00:00.000Z',
        }),
      ].join('\n')
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.missingGateNames).toEqual(['gstack.qa.exhaustive']);
    expect(evaluation.passedGateNames).toEqual([
      'gstack.review',
      'gstack.ship',
    ]);
  });
});
