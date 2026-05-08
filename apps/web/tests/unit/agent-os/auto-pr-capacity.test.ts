import { describe, expect, it } from 'vitest';
import { parseAgentRunArtifact } from '@/lib/agent-os/artifact';
import { buildAutoPrCapacityBlockedArtifact } from '@/lib/agent-os/auto-pr-capacity';

describe('Auto-PR capacity artifact', () => {
  it('builds a blocked AgentRunArtifact for capacity exhaustion', () => {
    const artifact = parseAgentRunArtifact(
      buildAutoPrCapacityBlockedArtifact({
        branchName: 'codex/jov-1926-agentos-gates',
        runId: '12345',
        repository: 'JovieInc/Jovie',
        openAgentPrs: 5,
        maxOpenAgentPrs: 5,
        waitedSeconds: 360,
        createdAt: new Date('2026-05-08T04:00:00.000Z'),
      })
    );

    expect(artifact.status).toBe('blocked');
    expect(artifact.blockedReason).toContain('configured limit 5');
    expect(artifact.verificationGates[0]).toMatchObject({
      name: 'github.ci',
      status: 'blocked',
    });
    expect(artifact.costEstimate?.usd).toBe(0);
  });
});
