import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyAdmissionThrottle,
  buildIntakeControlLoopReceipt,
  classifyIntakeReadiness,
} from '../intake-readiness.mjs';

function issue(overrides = {}) {
  return {
    id: 'issue-1',
    identifier: 'JOV-1',
    title: 'Tighten one isolated behaviour',
    updatedAt: '2026-08-15T00:00:00.000Z',
    state: { name: 'Triage' },
    assignee: null,
    labels: { nodes: [] },
    children: { nodes: [] },
    comments: { nodes: [] },
    description:
      '## Taste lock\nKeep the interaction compact.\n\n## Acceptance criteria\n- Focused test passes.',
    ...overrides,
  };
}

describe('intake readiness classifier', () => {
  it('recognizes a bounded contract alias without granting admission', () => {
    const result = classifyIntakeReadiness(issue());
    assert.equal(result.disposition, 'mechanical-ready');
    assert.equal(result.permittedNextAction, 'propose-readiness-receipt');
    assert.equal(result.requiresHumanDecision, false);
  });

  it('holds incomplete work and routes risk or ownership for a decision', () => {
    assert.equal(
      classifyIntakeReadiness(issue({ description: '## Scope\nOne change.' }))
        .reason,
      'acceptance-evidence-missing'
    );
    assert.equal(
      classifyIntakeReadiness(issue({ title: 'Rotate payment credential' }))
        .disposition,
      'decision-required'
    );
    assert.equal(
      classifyIntakeReadiness(
        issue({ labels: { nodes: [{ name: 'symphony' }] } })
      ).disposition,
      'owned-active'
    );
  });

  it('chooses at most four independent normal candidates in a control-loop receipt', () => {
    const first = classifyIntakeReadiness(issue({ identifier: 'JOV-1' }));
    const second = classifyIntakeReadiness(issue({ identifier: 'JOV-2' }));
    const third = classifyIntakeReadiness(issue({ identifier: 'JOV-3' }));
    const fourth = classifyIntakeReadiness(issue({ identifier: 'JOV-4' }));
    const fifth = classifyIntakeReadiness(issue({ identifier: 'JOV-5' }));
    const throttle = applyAdmissionThrottle([
      fifth,
      third,
      first,
      fourth,
      second,
    ]);
    assert.deepEqual(
      throttle.normal.map(receipt => receipt.issue),
      ['JOV-1', 'JOV-2', 'JOV-3', 'JOV-4']
    );

    const loop = buildIntakeControlLoopReceipt([issue()]);
    assert.equal(loop.mode, 'dry-run');
    assert.equal(loop.mutations, 0);
    assert.equal(loop.dispositions['mechanical-ready'], 1);
  });
});
