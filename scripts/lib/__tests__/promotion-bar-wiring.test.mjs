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
  assert.ok(
    step.with.script.slice(observe).includes('reportPromotionError(error)')
  );
  assert.equal(step.env.PROMOTION_BAR_MODE, 'shadow');
  assert.ok(workflow.on.pull_request_target.types.includes('labeled'));
});
test('classifier keeps its kill switch, protected checkout and existing secret; no queue mutation is registered', () => {
  const workflow = load(read('.github/workflows/ejection-classifier.yml'));
  assert.ok(
    workflow.jobs.classify.if.includes("vars.EJECTION_CLASSIFIER_OFF != '1'")
  );
  assert.equal(workflow.jobs.classify['runs-on'], 'ubuntu-latest');
  assert.equal(workflow.jobs.classify.steps[0].with.ref, 'main');
  const step = workflow.jobs.classify.steps.find(
    s => s.name === 'Classify and record'
  );
  assert.equal(step.env.LINEAR_API_KEY, '${{ secrets.LINEAR_API_KEY }}');
  assert.equal(step['continue-on-error'], true);
  assert.ok(
    !read('scripts/lib/ejection-classifier.mjs').includes('enqueuePullRequest')
  );
});
