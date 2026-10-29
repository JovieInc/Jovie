import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

test('wait: a rejecting reader is UNREADABLE, never PASS', async () => {
  const result = await waitForVerdict({
    readMarker: async () => {
      throw new Error('boom');
    },
    ...ctx,
    budgetSeconds: 60,
    intervalSeconds: 20,
    sleep: async () => {},
  });
  assert.equal(result.verdict, 'UNREADABLE');
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

// Exercise the shipped CLI and the real shared client against a local gh fixture.
// The persisted ledger proves the call crossed budget admission at deploy priority.
for (const [scenario, expectedExit, verdict, calls] of [
  ['bootstrap', EXIT.PASS, 'PASS', 2],
  ['active', EXIT.PENDING_TIMEOUT, 'PENDING', 2],
  ['denied', EXIT.UNREADABLE, 'UNREADABLE', 1],
]) {
  test(`CLI: ${scenario} uses the shared deploy budget and preserves ${verdict}`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'predecessor-verdict-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}
const args = process.argv.slice(2);
const endpoint = args.at(-1);
let body;
if (endpoint.endsWith('/production-controller.yml')) {
  if (process.env.VERDICT_SCENARIO === 'denied') {
    process.stderr.write('HTTP 403: permission denied');
    process.exit(1);
  }
  body = { id: 42, path: '.github/workflows/production-controller.yml', state: 'active' };
} else if (endpoint.includes('/artifacts?')) {
  body = { total_count: 0, artifacts: [] };
} else if (endpoint.includes('/production-controller.yml/runs?')) {
  body = { workflow_runs: process.env.VERDICT_SCENARIO === 'active' ? [{ id: 90, status: 'in_progress' }] : [] };
} else {
  process.stderr.write('unexpected endpoint: ' + endpoint);
  process.exit(1);
}
if (args.includes('--include')) process.stdout.write('HTTP/2.0 200 OK\\n\\n');
process.stdout.write(JSON.stringify(body));
`,
      { mode: 0o755 }
    );
    const output = join(dir, 'output');
    const run = spawnSync(
      process.execPath,
      [
        new URL('./production-predecessor-verdict.mjs', import.meta.url)
          .pathname,
        '--repo',
        'JovieInc/Jovie',
        '--predecessor-sha',
        PRED,
        '--release-sha',
        REL,
        '--current-run-id',
        '100',
        '--budget-seconds',
        '0',
      ],
      {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          JOVIE_API_STATE_DIR: dir,
          JOVIE_GITHUB_CREDENTIAL: 'predecessor-test',
          GITHUB_OUTPUT: output,
          VERDICT_SCENARIO: scenario,
        },
      }
    );
    assert.equal(run.status, expectedExit, run.stderr);
    assert.match(
      readFileSync(output, 'utf8'),
      new RegExp(`^verdict=${verdict}\n`)
    );
    const ledger = JSON.parse(
      readFileSync(join(dir, 'api-ledger/github.json'), 'utf8')
    );
    const usage = Object.values(ledger.credentials['predecessor-test'].usage);
    assert.equal(
      usage.reduce((sum, hour) => sum + hour.deploy.attempts, 0),
      calls
    );
  });
}
