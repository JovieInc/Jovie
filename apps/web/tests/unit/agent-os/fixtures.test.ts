import { describe, expect, it } from 'vitest';
import { AgentRunArtifactSchema } from '@/lib/agent-os/artifact';
import { AGENT_OS_ADMIN_FIXTURE_ARTIFACTS } from '@/lib/agent-os/fixtures';

describe('AGENT_OS_ADMIN_FIXTURE_ARTIFACTS', () => {
  it('matches the AgentRunArtifact schema', () => {
    for (const artifact of AGENT_OS_ADMIN_FIXTURE_ARTIFACTS) {
      expect(AgentRunArtifactSchema.safeParse(artifact).success).toBe(true);
    }
  });

  it('keeps fixture update timestamps at or after creation', () => {
    for (const artifact of AGENT_OS_ADMIN_FIXTURE_ARTIFACTS) {
      expect(new Date(artifact.updatedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(artifact.createdAt).getTime()
      );
    }
  });

  it('covers the admin ops v1 run states', () => {
    const statuses = new Set(
      AGENT_OS_ADMIN_FIXTURE_ARTIFACTS.map(artifact => artifact.status)
    );

    expect([...statuses]).toEqual(
      expect.arrayContaining([
        'queued',
        'running',
        'blocked',
        'failed',
        'review',
        'done',
      ])
    );
    expect(
      AGENT_OS_ADMIN_FIXTURE_ARTIFACTS.some(
        artifact =>
          artifact.humanApprovalRequired &&
          artifact.humanGate.status === 'pending'
      )
    ).toBe(true);
  });
});
