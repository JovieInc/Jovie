import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateRecoveryLiveness } from '../policy-gate-liveness.mjs';

const NOW = '2026-09-08T20:10:00Z';

function node(id, overrides = {}) {
  return {
    id,
    state: 'blocked',
    dependsOn: [],
    repairs: [],
    owner: 'Gem',
    remedy: `repair-${id}`,
    observedAt: '2026-09-08T20:09:00Z',
    progressAt: '2026-09-08T20:09:30Z',
    maxWaitMs: 120_000,
    ...overrides,
  };
}

describe('runtime recovery liveness', () => {
  it('detects direct and multi-hop recovery cycles', () => {
    const direct = evaluateRecoveryLiveness(
      {
        nodes: [
          node('repair', {
            dependsOn: ['controller'],
            repairs: ['controller'],
          }),
          node('controller'),
        ],
      },
      { now: NOW }
    );
    assert.deepEqual(direct.cycles, [['repair', 'controller', 'repair']]);
    const indirect = evaluateRecoveryLiveness(
      {
        nodes: [
          node('drain', { dependsOn: ['deployment'] }),
          node('deployment', { dependsOn: ['repair'] }),
          node('repair', { dependsOn: ['drain'] }),
        ],
      },
      { now: NOW }
    );
    assert.deepEqual(indirect.cycles, [['drain', 'deployment', 'repair', 'drain']]);
  });

  it('distinguishes progressing waits from stale unknown and expired waits', () => {
    assert.equal(evaluateRecoveryLiveness({ nodes: [node('drain', { state: 'waiting' })] }, { now: NOW }).ok, true);
    const stale = evaluateRecoveryLiveness(
      {
        nodes: [
          node('drain', {
            state: 'unknown',
            observedAt: '2026-09-08T19:00:00Z',
            progressAt: '2026-09-08T19:00:00Z',
          }),
          node('stuck-wait', {
            state: 'waiting',
            observedAt: '2026-09-08T19:00:00Z',
            progressAt: '2026-09-08T19:00:00Z',
          }),
        ],
      },
      { now: NOW }
    );
    assert.equal(stale.qualification, 'UNKNOWN');
    assert.equal(stale.unknown.length, 2);
    assert.equal(stale.stalled.length, 1);
  });

  it('breaks one source-qualified edge only after unrelated WIP drains', () => {
    const nodes = [
      node('repair-17455', {
        dependsOn: ['old-controller'],
        repairs: ['old-controller'],
      }),
      node('old-controller'),
    ];
    const recoveryPaths = [
      {
        id: 'bootstrap-17455',
        authority: 'source-qualified-recovery',
        breaksDependency: { from: 'repair-17455', to: 'old-controller' },
        scope: {
          repository: 'JovieInc/Jovie',
          pr: 17455,
          headSha: 'd'.repeat(40),
          scopeKey: 'pr:17455',
        },
        maxAttempts: 1,
        preservesUnrelatedWork: true,
        requiresEmptyWip: true,
        expiresAt: '2026-09-08T21:00:00Z',
        owner: 'admission-owner',
        progressCondition: 'native merge request or terminal receipt',
      },
    ];
    const waiting = evaluateRecoveryLiveness(
      {
        nodes,
        recoveryPaths,
        workInProgress: [{ id: 'PR-17433', scopeKey: 'pr:17433', blockedOn: null }],
      },
      { now: NOW }
    );
    assert.equal(waiting.recoveryActions[0].reason, 'unrelated-wip-preserved');
    assert.deepEqual(waiting.cycles, [['repair-17455', 'old-controller', 'repair-17455']]);

    const executable = evaluateRecoveryLiveness(
      {
        nodes,
        recoveryPaths,
        workInProgress: [
          {
            id: 'stuck-17455',
            scopeKey: 'pr:17455',
            blockedOn: 'old-controller',
          },
        ],
      },
      { now: NOW }
    );
    assert.equal(executable.ok, true);
    assert.deepEqual(executable.cycles, []);
    assert.deepEqual(executable.recoveryActions[0].stuckWork, ['stuck-17455']);
    assert.equal(executable.recoveryActions[0].preservesUnrelatedWork, true);
  });
});
