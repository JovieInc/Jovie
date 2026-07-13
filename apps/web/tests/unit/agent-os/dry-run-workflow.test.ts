import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentOsDryRunWorkflowInputSchema,
  buildAgentOsDryRunArtifact,
  emitAgentOsDryRunArtifact,
} from '@/workflows/agent-os-dry-run';

const { mockWrite, mockReleaseLock } = vi.hoisted(() => ({
  mockWrite: vi.fn(),
  mockReleaseLock: vi.fn(),
}));

vi.mock('workflow', () => ({
  getWritable: () => ({
    getWriter: () => ({
      write: mockWrite,
      releaseLock: mockReleaseLock,
    }),
  }),
}));

describe('AgentOS dry-run workflow artifact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWrite.mockResolvedValue(undefined);
  });

  it('builds a deterministic, read-only AgentRunArtifact', () => {
    const artifact = buildAgentOsDryRunArtifact({
      input: {
        requestedBy: 'admin@example.com',
        sourceRunId: 'wrun_123',
      },
      createdAt: new Date('2026-05-08T21:30:00.000Z'),
    });

    expect(artifact).toMatchObject({
      id: 'agentos-wdk-dry-run-wrun_123',
      source: 'vercel-workflow',
      sourceRunId: 'wrun_123',
      kind: 'workflow',
      status: 'done',
      modelRoute: 'deterministic',
      linearIssueId: 'JOV-1971',
      adminSurface: '/app/admin/ops',
      costEstimate: {
        usd: 0,
        route: 'deterministic',
      },
      metadata: {
        dryRun: true,
        requestedBy: 'admin@example.com',
        runtime: 'vercel-workflow',
      },
    });
    expect(artifact.allowedActions).toEqual(['read', 'summarize']);
    expect(artifact.forbiddenActions).toEqual(
      expect.arrayContaining([
        'write_code',
        'merge',
        'deploy',
        'mutate_linear',
        'send_outbound',
        'change_auth',
        'change_billing',
        'change_security',
      ])
    );
  });

  it('accepts the longest source run id that still fits the artifact id contract', () => {
    const sourceRunId = 'a'.repeat(160);

    const artifact = buildAgentOsDryRunArtifact({
      input: {
        requestedBy: 'admin@example.com',
        sourceRunId,
      },
      createdAt: new Date('2026-05-08T21:30:00.000Z'),
    });

    expect(artifact.id).toHaveLength(180);
    expect(artifact.id).toBe(`agentos-wdk-dry-run-${sourceRunId}`);
  });

  it('rejects non-http Linear URLs in workflow input', () => {
    const result = AgentOsDryRunWorkflowInputSchema.safeParse({
      linearIssueUrl: 'javascript:alert(1)',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.path)).toEqual(
        expect.arrayContaining([['linearIssueUrl']])
      );
    }
  });

  it('emits the artifact and summary through the workflow writable stream', async () => {
    const artifact = await emitAgentOsDryRunArtifact({
      requestedBy: 'admin@example.com',
      sourceRunId: 'wrun_456',
    });

    expect(artifact.id).toBe('agentos-wdk-dry-run-wrun_456');
    expect(mockWrite).toHaveBeenCalledTimes(2);
    expect(mockWrite).toHaveBeenNthCalledWith(1, {
      type: 'agent_run_artifact',
      artifact,
    });
    expect(mockWrite).toHaveBeenNthCalledWith(2, {
      type: 'agent_run_summary',
      artifactId: artifact.id,
      status: 'done',
    });
    expect(mockReleaseLock).toHaveBeenCalledTimes(1);
  });

  it('releases the writer lock when artifact emission fails', async () => {
    mockWrite.mockRejectedValueOnce(new Error('stream write failed'));

    await expect(
      emitAgentOsDryRunArtifact({
        requestedBy: 'admin@example.com',
        sourceRunId: 'wrun_fail',
      })
    ).rejects.toThrow('stream write failed');

    expect(mockReleaseLock).toHaveBeenCalledTimes(1);
  });
});
