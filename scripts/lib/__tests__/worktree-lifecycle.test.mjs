import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveTtlDays, evaluateCandidate } from '../worktree-lifecycle.mjs';

const base = {
  path: '/tmp/jovie-wt',
  branch: 'refs/heads/agent/example',
  dirty: false,
  locked: false,
  activeProcess: false,
  namedUser: false,
  currentMain: false,
  metadata: {
    owner: 'unclaimed',
    run_id: 'run-1',
    created_at: '2026-06-01T00:00:00Z',
    last_activity_at: '2026-06-01T00:00:00Z',
  },
};

const policy = { ttlDays: 7, emergencyTtlDays: 2, criticalTtlDays: 1 };

function candidate(overrides = {}, now = '2026-06-10T00:00:00Z') {
  const metadata =
    Object.hasOwn(overrides, 'metadata') && overrides.metadata === null
      ? null
      : { ...base.metadata, ...(overrides.metadata ?? {}) };
  return evaluateCandidate(
    { ...base, ...overrides, metadata },
    { now, policy }
  );
}

test('dirty worktrees are never eligible', () => {
  const result = candidate({ dirty: true });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'dirty');
});

test('locked worktrees are never eligible', () => {
  const result = candidate({ locked: true });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'locked');
});

test('worktrees with active processes are never eligible', () => {
  const result = candidate({ activeProcess: true });
  assert.equal(result.eligible, false);
  assert.equal(result.reason, 'active_process');
});

test('named-user and current-main worktrees are never eligible', () => {
  assert.equal(candidate({ namedUser: true }).reason, 'named_user');
  assert.equal(candidate({ currentMain: true }).reason, 'current_main');
});

test('unclaimed worktree is eligible only after normal TTL', () => {
  assert.equal(candidate().eligible, true);
  assert.equal(candidate({}, '2026-06-07T00:00:00Z').reason, 'ttl_not_reached');
});

test('missing or non-unclaimed metadata fails closed', () => {
  assert.equal(candidate({ metadata: null }).reason, 'missing_metadata');
  assert.equal(
    candidate({
      metadata: {
        owner: 'summer',
        run_id: 'run-2',
        created_at: '2026-06-01T00:00:00Z',
      },
    }).reason,
    'claimed'
  );
});

test('emergency disk pressure tightens TTL and reports alert', () => {
  assert.equal(effectiveTtlDays(policy, 50), 7);
  assert.equal(effectiveTtlDays(policy, 15), 2);
  assert.equal(effectiveTtlDays(policy, 5), 1);
  const emergency = evaluateCandidate(
    { ...base, metadata: { ...base.metadata } },
    {
      now: '2026-06-04T00:00:00Z',
      policy,
      freeGb: 15,
    }
  );
  assert.equal(emergency.eligible, true);
  assert.equal(emergency.ttlDays, 2);
  assert.equal(emergency.alert, 'summer_disk_pressure');
});
