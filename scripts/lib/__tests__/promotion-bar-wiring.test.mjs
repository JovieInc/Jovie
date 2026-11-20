import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const { load } = createRequire(import.meta.url)('js-yaml');
const read = path =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('real collector CLI exits zero and logs a JSON shadow HOLD on setup errors, including enforce requests', t => {
  const dir = mkdtempSync(join(tmpdir(), 'promotion-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const summary = join(dir, 'summary');
  const result = spawnSync(
    process.execPath,
    ['scripts/lib/promotion-readiness-collect.mjs'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        REPO: 'invalid',
        GH_TOKEN: '',
        PROMOTION_BAR_MODE: 'enforce',
        GITHUB_STEP_SUMMARY: summary,
      },
    }
  );
  assert.equal(result.status, 0);
  const verdict = JSON.parse(result.stdout.trim());
  assert.equal(verdict.schema, 'promotion-bar/v1');
  assert.equal(verdict.mode, 'shadow');
  assert.equal(verdict.ready, false);
  assert.ok(readFileSync(summary, 'utf8').includes(result.stdout.trim()));
});
test('collector is immediately before undraft and enqueue, with isolated advisory error paths', () => {
  const shell = read('scripts/auto-ready-green-drafts.sh');
  const mutation = shell.indexOf('if ! gh pr ready "$n" -R "$REPO" >/dev/null');
  const collect = shell.indexOf(
    'node "$SCRIPT_DIR/lib/promotion-readiness-collect.mjs"'
  );
  assert.ok(collect > 0 && collect < mutation);
  const workflow = load(read('.github/workflows/merge-queue-green-enroll.yml'));
  const step = workflow.jobs.enroll.steps.find(
    s => s.name === 'Enqueue green PRs'
  );
  const observe = step.with.script.indexOf('await promotion.logPromotion(');
  assert.ok(
    observe > 0 &&
      observe < step.with.script.indexOf('enqueuePullRequest(input:')
  );
  assert.ok(read('scripts/lib/promotion-enroll.mjs').includes('catch (error)'));
  assert.equal(step.env.PROMOTION_BAR_MODE, 'shadow');
  assert.ok(workflow.on.pull_request_target.types.includes('labeled'));
});
test('classifier keeps its kill switch, protected checkout and existing secret; no queue mutation is registered', () => {
  const workflow = load(read('.github/workflows/ejection-classifier.yml'));
  assert.ok(
    workflow.jobs.classify.if.includes("vars.EJECTION_CLASSIFIER_OFF != '1'")
  );
  assert.equal(workflow.jobs.classify['runs-on'], 'ubuntu-24.04');
  assert.equal(workflow.jobs.classify.steps[0].with.ref, 'main');
  const step = workflow.jobs.classify.steps.find(
    s => s.name === 'Classify and record'
  );
  assert.equal(step.env.LINEAR_API_KEY, '${{ secrets.LINEAR_API_KEY }}');
  assert.equal(step['continue-on-error'], undefined);
  assert.ok(step.run.includes('|| echo'));
  assert.ok(
    workflow.jobs.classify.steps.every(
      s => s['continue-on-error'] === undefined
    )
  );
  assert.ok(
    !read('scripts/lib/ejection-classifier.mjs').includes('enqueuePullRequest')
  );
});

test('classifier CLI and artifact service failures remain advisory without continue-on-error', async () => {
  const workflow = load(read('.github/workflows/ejection-classifier.yml'));
  const { uploadEjectionReceipt } = await import(
    '../../../.github/actions/ejection-artifact/upload.mjs'
  );
  for (const run of [
    () => ({ status: 1 }),
    () => ({ status: null, error: new Error('offline') }),
    () => {
      throw new Error('offline');
    },
  ]) {
    const messages = [];
    uploadEjectionReceipt({
      run,
      env: { RUN_ID: '123' },
      log: line => messages.push(line),
    });
    assert.equal(messages.length, 1);
    assert.match(messages[0], /notice.*[Aa]rtifact/);
  }
  const result = spawnSync(
    process.execPath,
    ['scripts/lib/ejection-classifier.mjs'],
    {
      encoding: 'utf8',
      env: { ...process.env, REPO: 'invalid', GH_TOKEN: '' },
    }
  );
  assert.equal(result.status, 0);
  assert.match(result.stderr, /ejection classifier advisory/);
  const upload = workflow.jobs.classify.steps.find(
    s => s.name === 'Upload advisory receipt'
  );
  assert.equal(upload.uses, './.github/actions/ejection-artifact');
});

test('enroll evidence is lazy, caches health and enforces the separate one-infra-retry budget', async () => {
  const { createEnrollPromotion } = await import('../promotion-enroll.mjs');
  const head = 'a'.repeat(40);
  let reads = 0,
    healthReads = 0,
    spent = 0;
  const promotion = createEnrollPromotion({
    core: { info() {} },
    env: {},
    repository: { owner: 'JovieInc', repo: 'Jovie' },
    net: {
      async readRetryEvidence() {
        reads++;
        return {
          complete: true,
          runs: [],
          retries: spent,
          receipts: [{ schema: 'ejection/v1', head, run: 99, class: 'infra' }],
        };
      },
      async health() {
        healthReads++;
        return { complete: true, circuitOpen: false };
      },
      async reserveRetry() {
        spent++;
      },
    },
  });
  assert.equal(reads, 0);
  const input = { pr: 1, head, removed: true };
  const first = await promotion.retry(input);
  assert.equal(first.reason, 'infra-retry');
  await promotion.reserveRetry(head, first);
  assert.equal((await promotion.retry(input)).reason, 'infra-retry-exhausted');
  assert.equal(healthReads, 1);
  assert.equal(reads, 2);
});

test('exact-run legacy release never releases another deterministic failure on the same head', async () => {
  const { createEnrollPromotion } = await import('../promotion-enroll.mjs');
  const head = 'a'.repeat(40);
  const promotion = createEnrollPromotion({
    core: { info() {} },
    env: {},
    repository: { owner: 'JovieInc', repo: 'Jovie' },
    net: {
      async readRetryEvidence() {
        return {
          complete: true,
          runs: [],
          retries: 0,
          receipts: [11, 12].map(run => ({
            schema: 'ejection/v1',
            head,
            run,
            class: 'code',
          })),
        };
      },
      async health() {
        return { complete: true, circuitOpen: false };
      },
    },
  });
  const decision = await promotion.retry({
    pr: 1,
    head,
    removed: true,
    failure: {
      action: 'retry-once',
      reason: 'human-failure-release',
      latest: { runId: 12 },
    },
  });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, 'head-unchanged-non-infra');
});

const retryHead = 'a'.repeat(40);
const noHold = { action: 'allow', reason: 'ejection-reenroll' };
const retryInput = { pr: 1, head: retryHead, removed: true, failure: noHold };
const retryEvidence = (extra = {}) => ({
  complete: true,
  retries: 0,
  runs: [],
  receipts: [
    {
      schema: 'ejection/v1',
      head: retryHead,
      run: 99,
      attempt: 1,
      class: 'code',
    },
  ],
  ...extra,
});
async function enrollPolicy(net, extra = {}) {
  const { createEnrollPromotion } = await import('../promotion-enroll.mjs');
  const logs = [];
  return {
    logs,
    policy: createEnrollPromotion({
      core: { info: line => logs.push(JSON.parse(line)) },
      env: {},
      repository: { owner: 'JovieInc', repo: 'Jovie' },
      net,
      ...extra,
    }),
  };
}

test('replacement heads inherit no retry reads, health, reservations or ejection labels', async () => {
  let reads = 0;
  const unavailable = async () => {
    reads++;
    throw new Error('unavailable');
  };
  const { policy, logs } = await enrollPolicy({
    readRetryEvidence: unavailable,
    health: unavailable,
    reserveRetry: unavailable,
  });
  assert.deepEqual(
    await policy.retry({
      ...retryInput,
      head: 'b'.repeat(40),
      removed: false,
      labels: ['mq-ejected:code'],
    }),
    { allow: true, reason: 'new-head', retry: false }
  );
  assert.equal(reads, 0);
  assert.deepEqual(logs, []);
});

test('existing no-hold authority allows the first same-head retry despite advisory code attribution', async () => {
  let retries = 0;
  const { policy } = await enrollPolicy({
    readRetryEvidence: async () => retryEvidence({ retries }),
    health: async () => ({ complete: true, circuitOpen: false }),
    reserveRetry: async () => {
      retries++;
    },
  });
  const first = await policy.retry(retryInput);
  assert.equal(first.reason, 'infra-retry');
  await policy.reserveRetry(retryHead, first);
  assert.equal(
    (await policy.retry(retryInput)).reason,
    'infra-retry-exhausted'
  );
  // Failed attempts also bound recovery if a classifier races the reservation.
  const { policy: raced } = await enrollPolicy({
    readRetryEvidence: async () =>
      retryEvidence({
        receipts: [99, 100].map(run => ({
          ...retryEvidence().receipts[0],
          run,
        })),
      }),
    health: async () => ({ complete: true, circuitOpen: false }),
  });
  assert.equal((await raced.retry(retryInput)).reason, 'infra-retry-exhausted');
});

test('trusted infrastructure recovery overrides the advisory classifier for its exact run', async () => {
  const { policy } = await enrollPolicy({
    readRetryEvidence: async () => retryEvidence(),
    health: async () => ({ complete: true, circuitOpen: false }),
  });
  const first = await policy.retry({
    ...retryInput,
    removed: false,
    failure: {
      action: 'retry-once',
      reason: 'bounded-infrastructure-recovery',
      latest: {
        runId: 99,
        runAttempt: 1,
        classification: 'transient-infrastructure',
      },
    },
  });
  assert.equal(first.reason, 'infra-retry');
  assert.equal(first.evidence.receipts[0].class, 'infra');
});

test('unavailable, incomplete and missing retry evidence preserve prior admission and log a shadow reason', async () => {
  for (const net of [
    {},
    {
      readRetryEvidence: async () => {
        throw new Error('offline');
      },
      health: async () => ({ complete: true }),
    },
    {
      readRetryEvidence: async () => retryEvidence({ complete: false }),
      health: async () => ({ complete: true }),
    },
    {
      readRetryEvidence: async () => retryEvidence(),
      health: async () => ({ complete: false }),
    },
    {
      readRetryEvidence: async () => retryEvidence({ receipts: [] }),
      health: async () => ({ complete: true }),
    },
  ]) {
    const { policy, logs } = await enrollPolicy(net);
    for (const head of [retryHead, 'b'.repeat(40)]) {
      const result = await policy.retry({ ...retryInput, head });
      assert.equal(result.allow, true);
      assert.equal(result.retry, false);
      assert.equal(result.reason, 'retry-evidence-unavailable');
    }
    assert.equal(logs.length, 2);
    assert.ok(logs.every(log => log.mode === 'shadow' && log.error));
    assert.equal(
      (await policy.retry({ ...retryInput, removed: false })).reason,
      'new-head'
    );
  }
});

test('deterministic holds, manual removal and a complete open circuit remain blocking', async () => {
  const { policy, logs } = await enrollPolicy({
    readRetryEvidence: async () => retryEvidence(),
    health: async () => ({ complete: true, circuitOpen: true }),
  });
  assert.deepEqual(
    await policy.retry({
      ...retryInput,
      failure: { action: 'block', reason: 'deterministic-source-failure' },
    }),
    { allow: false, reason: 'deterministic-source-failure', retry: false }
  );
  assert.deepEqual(logs, []);
  assert.equal((await policy.retry(retryInput)).reason, 'circuit-open');
  const { policy: manual } = await enrollPolicy({
    readRetryEvidence: async () => retryEvidence(),
    health: async () => ({ complete: true, circuitOpen: false }),
  });
  assert.equal(
    (await manual.retry({ ...retryInput, manual: true })).reason,
    'manual-release-required'
  );
});

test('retry reservations use the existing app status writer and remain before enqueue', async () => {
  const writes = [];
  const { policy } = await enrollPolicy(
    {
      readRetryEvidence: async () => retryEvidence(),
      health: async () => ({ complete: true, circuitOpen: false }),
      reserveRetry: async () =>
        assert.fail('read-only evidence token cannot reserve retries'),
    },
    {
      github: {
        rest: {
          repos: { createCommitStatus: async status => writes.push(status) },
        },
      },
    }
  );
  await policy.reserveRetry(retryHead, await policy.retry(retryInput));
  assert.deepEqual(writes, [
    {
      owner: 'JovieInc',
      repo: 'Jovie',
      sha: retryHead,
      state: 'success',
      context: 'mq-retry/v1',
      description: 'spent:run=99;try=1',
      target_url: 'https://github.com/JovieInc/Jovie/actions/runs/99',
    },
  ]);
});
