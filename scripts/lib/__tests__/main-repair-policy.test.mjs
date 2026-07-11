import { describe, expect, it } from 'vitest';
import {
  buildRepairArtifact,
  rankRepairWork,
  routeRepairWork,
} from '../../hermes/lib/model-escalation-policy.ts';

describe('main repair policy', () => {
  it('prioritizes red main ahead of PR remediation and new issue intake', () => {
    expect(
      rankRepairWork({ mainRed: true, blockedPrs: 12, newIssues: 12 })
    ).toEqual(['main-red', 'pr-remediation', 'new-pr']);
  });

  it('keeps main-green mechanical repairs on the cost-safe local Qwen route', () => {
    const route = routeRepairWork({
      workKind: 'mechanical',
      mainRed: true,
      changedFiles: ['.github/workflows/trigger-guard.yml'],
    });
    expect(route).toMatchObject({
      route: 'mechanical-cheap',
      model: 'qwen3:4b-q4_K_M',
      provider: 'ollama',
      deterministicGate: true,
      codexAllowed: false,
      costCapUsd: 0,
    });
  });

  it('uses normal remediation models before exception-only Codex escalation', () => {
    expect(
      routeRepairWork({ workKind: 'normal', mainRed: true })
    ).toMatchObject({
      route: 'mechanical-cheap',
      model: 'deepseek/deepseek-v4-flash',
      provider: 'openrouter',
      codexAllowed: false,
    });
    expect(
      routeRepairWork({ workKind: 'semantic', mainRed: true, cheapFailures: 2 })
    ).toMatchObject({
      route: 'codex-semantic-repair',
      model: 'codex',
      provider: 'codex-cli',
      codexAllowed: true,
    });
  });

  it('emits the shared artifact schema and preserves cooldown evidence', () => {
    const artifact = JSON.parse(
      buildRepairArtifact({
        workId: 'main-abc123',
        priority: 'main-red',
        route: routeRepairWork({ workKind: 'mechanical', mainRed: true }),
        attempt: 1,
        cooldownUntil: '2026-07-10T06:00:00Z',
      })
    );
    expect(artifact.schema).toBe('jovie.repair/v1');
    expect(artifact.priority).toBe('main-red');
    expect(artifact.route.deterministicGate).toBe(true);
    expect(artifact.cooldownUntil).toBe('2026-07-10T06:00:00Z');
    expect(artifact.safety.merge).toBe(false);
  });
});
