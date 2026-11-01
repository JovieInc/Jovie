import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyInFlightOverride,
  decideVerdict,
  EXIT,
  earlierActiveRuns,
  exitCodeFor,
  waitForVerdict,
} from './production-predecessor-verdict.mjs';

const PRED = 'a'.repeat(40);
const REL = 'b'.repeat(40);
const ctx = { predecessorSha: PRED, releaseSha: REL };
const verified = {
  state: 'verified',
  reason: 'ok',
  deploymentId: 'dpl_abc123',
};

test('verified predecessor with an exact deployment is PASS', () => {
  assert.equal(decideVerdict(verified, ctx).verdict, 'PASS');
});

test('foreign none bootstraps; self none does not', () => {
  const none = { state: 'none', reason: 'no_marker' };
  assert.equal(decideVerdict(none, ctx).verdict, 'PASS');
  assert.equal(
    decideVerdict(none, { predecessorSha: REL, releaseSha: REL }).verdict,
    'PASS',
    'exact-SHA rerun is owned by the marker classifier'
  );
});

test('verified without a dpl_ deployment id refuses', () => {
  const result = decideVerdict(
    { state: 'verified', reason: 'ok', deploymentId: 'not-applicable' },
    ctx
  );
  assert.equal(result.verdict, 'FAIL');
});

for (const [name, marker, expected, exit] of [
  [
    'pending',
    { state: 'pending', reason: 'verification_running' },
    'PENDING',
    EXIT.PENDING_TIMEOUT,
  ],
  [
    'recovery_available',
    { state: 'recovery_available', reason: 'interrupted' },
    'FAIL',
    EXIT.FAIL,
  ],
  [
    'manual',
    { state: 'manual', reason: 'contradictory_marker_attempt' },
    'FAIL',
    EXIT.FAIL,
  ],
  [
    'api error',
    { state: 'manual', reason: 'evidence_api_error' },
    'UNREADABLE',
    EXIT.UNREADABLE,
  ],
  ['malformed', { state: 'weird' }, 'UNREADABLE', EXIT.UNREADABLE],
  ['missing', undefined, 'UNREADABLE', EXIT.UNREADABLE],
]) {
  test(`deliberate red: ${name} predecessor refuses mutation`, () => {
    const result = decideVerdict(marker, ctx);
    assert.equal(result.verdict, expected);
    assert.notEqual(exitCodeFor(result), EXIT.PASS);
    assert.equal(exitCodeFor(result), exit);
  });
}

test('missing or malformed SHAs fail closed', () => {
  for (const bad of ['', undefined, 'abc']) {
    assert.equal(
      decideVerdict(verified, { predecessorSha: bad, releaseSha: REL }).verdict,
      'UNREADABLE'
    );
  }
});

test('wait: pending resolves to PASS when the verdict lands', async () => {
  const states = [
    { state: 'pending', reason: 'running' },
    { state: 'pending', reason: 'running' },
    verified,
  ];
  let clock = 0;
  const result = await waitForVerdict({
    readMarker: () => states.shift(),
    ...ctx,
    budgetSeconds: 600,
    intervalSeconds: 20,
    sleep: async ms => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(result.verdict, 'PASS');
  assert.equal(clock, 40_000);
});

test('wait: a verdict that never lands times out PENDING and refuses', async () => {
  let clock = 0;
  const result = await waitForVerdict({
    readMarker: () => ({ state: 'pending', reason: 'running' }),
    ...ctx,
    budgetSeconds: 60,
    intervalSeconds: 20,
    sleep: async ms => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(result.verdict, 'PENDING');
  assert.equal(result.timedOut, true);
  assert.equal(exitCodeFor(result), EXIT.PENDING_TIMEOUT);
});

test('wait: FAIL while waiting refuses immediately (no further polling)', async () => {
  const states = [
    { state: 'pending', reason: 'running' },
    { state: 'recovery_available', reason: 'rolled_back' },
    verified,
  ];
  let clock = 0;
  const result = await waitForVerdict({
    readMarker: () => states.shift(),
    ...ctx,
    budgetSeconds: 600,
    intervalSeconds: 20,
    sleep: async ms => {
      clock += ms;
    },
    now: () => clock,
  });
  assert.equal(result.verdict, 'FAIL');
  assert.equal(states.length, 1);
});

test('wait: a throwing reader is UNREADABLE, never PASS', async () => {
  const result = await waitForVerdict({
    readMarker: () => {
      throw new Error('boom');
    },
    ...ctx,
    budgetSeconds: 60,
    intervalSeconds: 20,
    sleep: async () => {},
  });
  assert.equal(result.verdict, 'UNREADABLE');
});

test('wait: a rejected reader is UNREADABLE, never PASS', async () => {
  const result = await waitForVerdict({
    readMarker: () => Promise.reject(new Error('boom')),
    ...ctx,
    budgetSeconds: 60,
    intervalSeconds: 20,
    sleep: async () => {},
  });
  assert.equal(result.verdict, 'UNREADABLE');
});

test('GitHub reads go through runGh, not a gh subprocess', () => {
  const source = readFileSync(
    new URL('./production-predecessor-verdict.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /from '\.\.\/\.\.\/packages\/api-client\/gh\.ts'/);
  assert.match(source, /await runGh\(args, \{ priority: 'deploy' \}\)/);
  assert.match(source, /run\.deferred \|\| run\.code !== 0/);
  assert.doesNotMatch(source, /spawnSync\(\s*'gh'/);
  assert.match(source, /spawnSync\(\s*process\.execPath/);
});

// Workflow wiring: both production mutation boundaries are gated, in order.
const release = readFileSync(
  new URL('../workflows/production-release.yml', import.meta.url),
  'utf8'
);
const controller = readFileSync(
  new URL('../workflows/production-controller.yml', import.meta.url),
  'utf8'
);
function job(name) {
  const start = release.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, name);
  const rest = release.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-z0-9-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test('migrate-production gates on the predecessor verdict before any DB step', () => {
  const body = job('migrate-production');
  const gate = body.indexOf('production-predecessor-verdict.mjs');
  assert.ok(gate > 0);
  for (const marker of [
    'setup-doppler',
    'drizzle-migrate-preflight',
    'drizzle:migrate:ci',
  ]) {
    assert.ok(body.indexOf(marker) > gate, `${marker} must follow the gate`);
  }
  assert.match(body, /actions: read/);
});

test('promote-production gates on the predecessor verdict and promote requires it', () => {
  const body = job('promote-production');
  const gate = body.indexOf('production-predecessor-verdict.mjs');
  const promote = body.indexOf('- name: Promote staged production deployment');
  assert.ok(gate > 0 && gate < promote);
  const promoteStep = body.slice(
    promote,
    body.indexOf('run: bash .github/scripts/promote-production-deployment.sh')
  );
  // Promote has no status-function override, so a failed gate skips it.
  assert.doesNotMatch(promoteStep, /always\(\)|failure\(\)|cancelled\(\)/);
  const gateStep = body.slice(gate, promote);
  assert.doesNotMatch(gateStep, /continue-on-error|always\(\)|failure\(\)/);
  assert.ok(
    body.indexOf('Recheck main immediately before production promotion') < gate
  );
});

test('the controller passes the authorized deployed SHA as predecessor', () => {
  assert.match(
    controller,
    /predecessor_sha: \$\{\{ needs\.authorize-production\.outputs\.deployed_sha \}\}/
  );
});

test('a live generation still verifying (no marker, earlier run active) is PENDING, not a bootstrap', () => {
  const runs = [
    { id: 90, status: 'in_progress' },
    { id: 95, status: 'completed' },
    { id: 120, status: 'queued' },
  ];
  const active = earlierActiveRuns(runs, 100);
  assert.deepEqual(
    active.map(r => r.id),
    [90]
  );
  const marker = applyInFlightOverride(
    { state: 'none', reason: 'no_marker' },
    active
  );
  assert.equal(decideVerdict(marker, ctx).verdict, 'PENDING');
  // No earlier active run: the foreign bootstrap stays admissible.
  assert.equal(
    decideVerdict(
      applyInFlightOverride(
        { state: 'none', reason: 'no_marker' },
        earlierActiveRuns(runs, 90)
      ),
      ctx
    ).verdict,
    'PASS'
  );
  // Only `none` is overridden; a verified marker is never downgraded.
  assert.equal(applyInFlightOverride(verified, active), verified);
  assert.deepEqual(earlierActiveRuns(runs, undefined), []);
});
