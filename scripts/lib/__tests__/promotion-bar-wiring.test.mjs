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
