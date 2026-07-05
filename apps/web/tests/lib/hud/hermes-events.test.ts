import { describe, expect, it } from 'vitest';
import { mapHermesEventsToAgentRunArtifacts } from '@/lib/hud/hermes-events';

describe('mapHermesEventsToAgentRunArtifacts', () => {
  it('maps merge-eval blocked events to hermes workflow artifacts', () => {
    const artifacts = mapHermesEventsToAgentRunArtifacts([
      {
        ts: '2026-06-20T12:00:00.000Z',
        source: 'pr-merge-queue',
        action: 'merge-eval',
        actor: 'hermes',
        detail: '#11313 blocked: CI red: failing: E2E',
        outcome: 'blocked',
        pr: 11313,
      },
    ]);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.source).toBe('hermes');
    expect(artifacts[0]?.status).toBe('blocked');
    expect(artifacts[0]?.title).toContain('pr-merge-queue');
    expect(artifacts[0]?.pullRequestUrl).toBe(
      'https://github.com/JovieInc/Jovie/pull/11313'
    );
    expect(artifacts[0]?.blockedReason).toContain('CI red');
  });

  it('dedupes identical events and caps volume', () => {
    const row = {
      ts: '2026-06-20T12:00:00.000Z',
      source: 'ship',
      action: 'ship-done',
      outcome: 'ok',
      detail: 'merged',
    };
    const artifacts = mapHermesEventsToAgentRunArtifacts([row, row]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.status).toBe('done');
  });
});
