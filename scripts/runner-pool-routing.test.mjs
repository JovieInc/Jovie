import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { load } from 'js-yaml';

const workflow = name =>
  /** @type {{ on: Record<string, unknown>, jobs: Record<string, { 'runs-on': string, steps?: Array<{ run?: string }> }> }} */ (
    load(
      readFileSync(
        new URL(`../.github/workflows/${name}.yml`, import.meta.url),
        'utf8'
      )
    )
  );
const pool = ['self-hosted', 'Linux', 'X64', 'jovie-fixed'];
// These selectors use only JSON parsing, property reads, equality and boolean
// operators, whose truthiness matches Actions for the booleans/strings here.
function select(
  expression,
  vars = {},
  { fork = false, event = 'pull_request' } = {}
) {
  return JSON.parse(
    JSON.stringify(
      runInNewContext(expression.slice(3, -2), {
        vars,
        github: {
          event_name: event,
          event: { pull_request: { head: { repo: { fork } } } },
        },
        fromJSON: JSON.parse,
      })
    )
  );
}

const source = workflow('source-validation').jobs;
for (const id of [
  'deterministic',
  'security',
  'migration',
  'coverage',
  'unit',
  'a11y',
]) {
  test(`${id}: defaults remain hosted and fork code cannot use the configured pool`, () => {
    const expression = source[id]['runs-on'];
    const fallback = ['deterministic', 'unit', 'a11y'].includes(id)
      ? 'ubuntu-24.04'
      : 'ubuntu-latest';
    assert.equal(select(expression), fallback);
    assert.deepEqual(
      select(expression, { RUNNER_SOURCE_VALIDATION: JSON.stringify(pool) }),
      pool
    );
    assert.equal(
      select(
        expression,
        { RUNNER_SOURCE_VALIDATION: JSON.stringify(pool) },
        { fork: true }
      ),
      fallback
    );
  });
}

test('PR Ready has an independent override and retains the hosted default', () => {
  const expression = source.ready['runs-on'];
  assert.equal(select(expression), 'ubuntu-latest');
  assert.deepEqual(
    select(expression, { RUNNER_READY: JSON.stringify(pool) }),
    pool
  );
});

for (const [file, id] of [['pr-targets-main', 'pr-targets-main']]) {
  test(`${file}: fixed merge-group routing retains precedence over the control-plane override`, () => {
    const expression = workflow(file).jobs[id]['runs-on'];
    assert.equal(select(expression), 'ubuntu-latest');
    assert.equal(
      select(expression, { RUNNER_CONTROL_PLANE: '"ubuntu-24.04"' }),
      'ubuntu-24.04'
    );
    assert.deepEqual(
      select(
        expression,
        { MERGE_GATE_POOL: 'fixed', RUNNER_CONTROL_PLANE: '"ubuntu-24.04"' },
        { event: 'merge_group' }
      ),
      pool
    );
  });
}

// PR Fleet Rules reads only the source PR, so it no longer runs on merge_group
// (.github/MERGE_QUEUE.md "Queue parity") and has no merge-gate pool route.
test('pr-fleet-rules: routes through the control-plane override and never runs on merge_group', () => {
  const fleet = workflow('pr-fleet-rules');
  assert.equal(Object.hasOwn(fleet.on, 'merge_group'), false);
  const expression = fleet.jobs.fleet['runs-on'];
  assert.equal(select(expression), 'ubuntu-latest');
  assert.equal(
    select(expression, { RUNNER_CONTROL_PLANE: '"ubuntu-24.04"' }),
    'ubuntu-24.04'
  );
  assert.doesNotMatch(expression, /MERGE_GATE_POOL/);
});

test('Fleet Rules never executes fork checkout code on the persistent pool', () => {
  assert.equal(
    select(
      workflow('pr-fleet-rules').jobs.fleet['runs-on'],
      {
        RUNNER_CONTROL_PLANE: JSON.stringify(pool),
      },
      { fork: true }
    ),
    'ubuntu-latest'
  );
});

for (const file of ['lane-fix-relay', 'merge-queue-green-enroll']) {
  const jobs = Object.values(workflow(file).jobs).filter(job =>
    job['runs-on']?.includes('RUNNER_CONTROL_PLANE')
  );
  test(`${file}: control-plane jobs accept string and label-array pools with hosted defaults`, () => {
    assert.ok(jobs.length > 0);
    for (const job of jobs) {
      assert.equal(select(job['runs-on']), 'ubuntu-latest');
      assert.deepEqual(
        select(job['runs-on'], { RUNNER_CONTROL_PLANE: JSON.stringify(pool) }),
        pool
      );
      assert.equal(
        select(job['runs-on'], { RUNNER_CONTROL_PLANE: '"ubuntu-24.04"' }),
        'ubuntu-24.04'
      );
      assert.throws(() =>
        select(job['runs-on'], { RUNNER_CONTROL_PLANE: 'invalid-json' })
      );
    }
  });
}

test('Auto-Ready fleet controllers retain the hosted CLI contract', () => {
  const jobs = workflow('auto-ready-agent-drafts').jobs;
  for (const id of ['auto-ready', 'green-source']) {
    assert.equal(jobs[id]['runs-on'], 'ubuntu-latest');
    assert.ok(jobs[id].steps.some(step => step.run === 'gh --version'));
  }
});
