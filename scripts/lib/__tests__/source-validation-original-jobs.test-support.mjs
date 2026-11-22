import assert from 'node:assert/strict';

/** @typedef {{name?: string, id?: string, shell?: string, if?: string, run?: string, uses?: string, env?: Record<string, string>, 'continue-on-error'?: boolean, with?: Record<string, unknown>}} Step */
/** @typedef {{steps: Step[], 'runs-on'?: string}} Job */
/** @typedef {{jobs: Record<string, Job>, permissions: unknown, on: unknown}} Workflow */

const DISK_READ_GUARD = 'Validate disk-read source contracts from trusted base';
const SETUP_NODE = 'Setup Node.js and pnpm';
const SETUP_PLAYWRIGHT = 'Setup Playwright warm path';
const CHECKOUT_UNIT =
  'Checkout exact source head for unit and merged guard proofs';
const FETCH_HEAD = 'Fetch head and base history only';
const PREPARE_MERGED = 'Prepare merged source guard generation';
const PRESERVE_MERGED = 'Preserve merged action generation';
const SETUP_MERGED_DEPS = 'Setup merged source dependencies';
const SETUP_MERGED_BROWSERS = 'Setup merged source browsers';
const MQ_PARITY_TOOLS = 'Resolve MQ parity tools for older source heads';
const MQ_PARITY_SCOPE = 'Select MQ parity scope';
const TYPECHECK_TWIN = 'Run typecheck lane parity';
const REMAINING_TWIN = 'Run remaining lane parity';
const UNIT_FLAKY_UPLOAD = 'Preserve retried-then-passed unit tests';
const PRODUCT_SCREENSHOTS = 'Pull product screenshots (Git LFS)';
const REUSE_STEP = 'Reuse exact-head proof for a metadata-only edit';

/** Serial → pooled disk-read step is an owned migration (same guards, first
 * failure wins). Normalize both sides so the deepEqual still pins everything
 * else on the unit job.
 * @param {Step} step
 */
function normalizeDiskReadStep(step) {
  if (!step?.run?.includes('SOURCE_GUARD_MODULE')) return step;
  assert.match(step.run, /selectSourceGuards/);
  assert.match(step.run, /listAllChangedFiles/);
  if (step.run.includes('runSourceGuards')) {
    assert.match(step.run, /ci-source-guard-pool\.mjs/);
    assert.match(step.run, /process\.exitCode\s*=\s*code/);
  } else {
    assert.match(step.run, /spawnSync\(guard\.command/);
    assert.match(step.run, /process\.exitCode\s*=\s*exitCode/);
  }
  return {
    ...step,
    // Drop concurrency export noise; pooling is opt-in via SOURCE_GUARD_CONCURRENCY.
    run: 'SOURCE_GUARDS_NORMALIZED',
    env: Object.fromEntries(
      Object.entries(step.env ?? {}).filter(
        ([key]) => key !== 'SOURCE_GUARD_CONCURRENCY'
      )
    ),
  };
}

/**
 * CI-28: metadata reuse also requires a successful unit 4/4 job on the proof
 * run (fail closed). Normalize the owned script delta against origin/main.
 * @param {Step} step
 * @param {{ requireCi28?: boolean }} [opts]
 */
function normalizeReuseStep(step, opts = {}) {
  if (step?.id !== 'reuse' && step?.name !== REUSE_STEP) return step;
  const run = String(step.run ?? '');
  assert.match(run, /head_sha=\$HEAD_SHA&event=pull_request&status=completed/);
  assert.match(run, /\.conclusion == "success"/);
  if (opts.requireCi28 || /Affected Unit Tests \(4\/4\)/.test(run)) {
    assert.match(run, /Affected Unit Tests \(4\/4\)/);
    assert.match(run, /guard_job=/);
    assert.match(run, /\[\[\s*"\$guard_job"\s*==\s*success\s*\]\]/);
    assert.match(run, /api-client\/cli\.ts/);
  } else {
    assert.match(run, /reuse=true/);
  }
  return { ...step, run: 'PROOF_REUSE_NORMALIZED' };
}

/**
 * Rewrite the pre-CI-28 setup form so deepEqual can pin the rest of the step.
 * Old: `matrix.shard == '4/4' || (reuse != true && (…))`
 * New: `reuse != true && (matrix.shard == '4/4' || …)`
 * @param {string} ifExpr
 */
function rewriteUnitSetupReuseGate(ifExpr) {
  const playwright =
    /^matrix\.shard == '4\/4' \|\| \(steps\.reuse\.outputs\.reuse != 'true' && steps\.scope\.outputs\.web == 'true'\)$/;
  if (playwright.test(ifExpr)) {
    return "steps.reuse.outputs.reuse != 'true' && (matrix.shard == '4/4' || steps.scope.outputs.web == 'true')";
  }
  const node =
    /^matrix\.shard == '4\/4' \|\| \(steps\.reuse\.outputs\.reuse != 'true' && \((.+)\)\)$/;
  const match = ifExpr.match(node);
  if (match) {
    return `steps.reuse.outputs.reuse != 'true' && (matrix.shard == '4/4' || ${match[1]})`;
  }
  return ifExpr;
}

/**
 * Ensure merged-guard steps gate on reuse (CI-28) for comparison with main.
 * @param {string} ifExpr
 */
function ensureMergedReuseGate(ifExpr) {
  if (ifExpr.includes("steps.reuse.outputs.reuse != 'true'")) return ifExpr;
  if (ifExpr === "matrix.shard == '4/4'") {
    return "matrix.shard == '4/4' && steps.reuse.outputs.reuse != 'true'";
  }
  if (ifExpr.startsWith("matrix.shard == '4/4' && ")) {
    return ifExpr.replace(
      "matrix.shard == '4/4' && ",
      "matrix.shard == '4/4' && steps.reuse.outputs.reuse != 'true' && "
    );
  }
  return ifExpr;
}

/**
 * Owned MQ parity twins may also provision Node. Strip those clauses so
 * deepEqual still pins the rest of the Setup Node step against origin/main.
 * @param {Step} step
 * @param {{ requireTypecheck?: boolean, requireRemaining?: boolean, requireCi28?: boolean }} [opts]
 */
function normalizeSetupNodeStep(step, opts = {}) {
  if (step?.name !== SETUP_NODE && step?.name !== SETUP_PLAYWRIGHT) return step;
  let ifExpr = rewriteUnitSetupReuseGate(String(step.if ?? ''));
  if (opts.requireCi28) {
    assert.match(ifExpr, /^steps\.reuse\.outputs\.reuse != 'true'/);
  }
  if (step.name === SETUP_NODE) {
    assert.match(ifExpr, /steps\.scope\.outputs\.web == 'true'/);
    if (opts.requireTypecheck) {
      assert.match(ifExpr, /steps\.mq-parity\.outputs\.typecheck == 'true'/);
    }
    if (opts.requireRemaining) {
      assert.match(ifExpr, /steps\.mq-parity\.outputs\.remaining == 'true'/);
    }
    ifExpr = ifExpr
      .replace(/\s*\|\|\s*steps\.mq-parity\.outputs\.typecheck == 'true'/, '')
      .replace(/steps\.mq-parity\.outputs\.typecheck == 'true'\s*\|\|\s*/, '')
      .replace(/\s*\|\|\s*steps\.mq-parity\.outputs\.remaining == 'true'/, '')
      .replace(/steps\.mq-parity\.outputs\.remaining == 'true'\s*\|\|\s*/, '');
  }
  return { ...step, if: ifExpr };
}

/**
 * CI-28: drop the unit 4/4 exception that kept checkout/fetch/guards live on
 * metadata reuse. Transform baseline forms to the gated shape for deepEqual.
 * @param {Step} step
 * @param {{ requireCi28?: boolean }} [opts]
 */
function normalizeUnit4x4ReuseGate(step, opts = {}) {
  const name = step?.name;
  let ifExpr = String(step.if ?? '');
  if (name === CHECKOUT_UNIT || name === FETCH_HEAD) {
    if (!ifExpr.includes("matrix.shard == '4/4'") && !opts.requireCi28) {
      return step;
    }
    ifExpr = ifExpr
      .replace(/\s*\|\|\s*matrix\.shard == '4\/4'/, '')
      .replace(/matrix\.shard == '4\/4'\s*\|\|\s*/, '');
    if (opts.requireCi28) {
      assert.equal(ifExpr, "steps.reuse.outputs.reuse != 'true'");
    }
    return { ...step, if: ifExpr };
  }
  if (
    name === PREPARE_MERGED ||
    name === PRESERVE_MERGED ||
    name === SETUP_MERGED_DEPS ||
    name === SETUP_MERGED_BROWSERS ||
    name === DISK_READ_GUARD
  ) {
    ifExpr = ensureMergedReuseGate(ifExpr);
    if (opts.requireCi28) {
      assert.match(ifExpr, /matrix\.shard == '4\/4'/);
      assert.match(ifExpr, /steps\.reuse\.outputs\.reuse != 'true'/);
    }
    return { ...step, if: ifExpr };
  }
  return step;
}

/** @param {Job} job @param {{ requireTypecheck?: boolean, requireRemaining?: boolean, requireCi28?: boolean }} [opts] */
function normalizeUnitJob(job, opts = {}) {
  return {
    ...job,
    steps: job.steps.map(step => {
      let next = normalizeReuseStep(step, opts);
      next = normalizeUnit4x4ReuseGate(next, opts);
      if (next.name === DISK_READ_GUARD) {
        const gatedIf = String(next.if ?? '');
        next = { ...normalizeDiskReadStep(next), if: gatedIf };
        if (opts.requireCi28) {
          assert.match(gatedIf, /steps\.reuse\.outputs\.reuse != 'true'/);
        }
        return next;
      }
      if (next.name === SETUP_NODE || next.name === SETUP_PLAYWRIGHT) {
        return normalizeSetupNodeStep(next, opts);
      }
      return next;
    }),
  };
}

/** @param {Job} job @param {{ requireCi28?: boolean }} [opts] */
function normalizeSourceJob(job, opts = {}) {
  return {
    ...job,
    steps: job.steps.map(step => normalizeReuseStep(step, opts)),
  };
}

/** Exact preservation of existing jobs, with only validated owned additions.
 * @param {Workflow} current
 * @param {Workflow} baseline
 */
export function assertOriginalJobsRetained(current, baseline) {
  const linear = 'Require a Linear issue reference from trusted base';
  const brand = 'Check brand spelling in PR text and commit messages';
  const owned = new Set([
    linear,
    brand,
    MQ_PARITY_TOOLS,
    MQ_PARITY_SCOPE,
    TYPECHECK_TWIN,
    REMAINING_TWIN,
    UNIT_FLAKY_UPLOAD,
    PRODUCT_SCREENSHOTS,
  ]);
  const strip = job => ({
    ...job,
    steps: job.steps.filter(step => !owned.has(step.name)),
  });
  assert.deepEqual(
    Object.keys(current.jobs).filter(id => id !== 'cancel-superseded'),
    Object.keys(baseline.jobs).filter(id => id !== 'cancel-superseded')
  );
  for (const [id, job] of Object.entries(baseline.jobs)) {
    if (id === 'cancel-superseded') continue;
    const actual = current.jobs[id];
    const left =
      id === 'unit'
        ? normalizeUnitJob(actual, {
            requireTypecheck: true,
            requireRemaining: true,
            requireCi28: true,
          })
        : normalizeSourceJob(actual, { requireCi28: true });
    const right =
      id === 'unit' ? normalizeUnitJob(job) : normalizeSourceJob(job);
    assert.deepEqual(strip(left), strip(right), id);
    for (const name of owned) {
      const added = actual.steps.filter(step => step.name === name);
      const kept = job.steps.filter(step => step.name === name);
      const firstLanding =
        ((id === 'deterministic' && (name === linear || name === brand)) ||
          (id === 'unit' &&
            (name === MQ_PARITY_TOOLS ||
              name === MQ_PARITY_SCOPE ||
              name === TYPECHECK_TWIN ||
              name === REMAINING_TWIN ||
              name === UNIT_FLAKY_UPLOAD)) ||
          (id === 'coverage' && name === PRODUCT_SCREENSHOTS)) &&
        !kept.length &&
        added.length === 1;
      assert.ok(kept.length === added.length || firstLanding, `${id}: ${name}`);
      if (!kept.length) continue;
      // Tools stub may grow twin keys without rewriting the rest of the step.
      if (name === MQ_PARITY_TOOLS && id === 'unit') {
        assert.equal(added[0]?.id, 'mq-parity-tools');
        assert.equal(added[0]?.if, kept[0]?.if);
        assert.deepEqual(added[0]?.env, kept[0]?.env);
        assert.match(String(added[0]?.run), /mq-parity-scope\.mjs/);
        assert.match(String(added[0]?.run), /typecheck=false/);
        assert.match(String(added[0]?.run), /remaining=false/);
        continue;
      }
      assert.deepEqual(added, kept, `${id}: ${name}`);
    }
  }

  const unitSteps = current.jobs.unit.steps;
  const tools = unitSteps.find(step => step.name === MQ_PARITY_TOOLS);
  assert.equal(tools?.id, 'mq-parity-tools');
  assert.equal(tools?.if, "steps.reuse.outputs.reuse != 'true'");
  assert.match(String(tools?.run), /mq-parity-scope\.mjs/);
  const scope = unitSteps.find(step => step.name === MQ_PARITY_SCOPE);
  assert.equal(scope?.id, 'mq-parity');
  assert.equal(scope?.if, "steps.reuse.outputs.reuse != 'true'");
  assert.match(String(scope?.run), /mq-parity-scope\.mjs/);
  const twin = unitSteps.find(step => step.name === TYPECHECK_TWIN);
  assert.equal(twin?.run, 'node scripts/ci-fast-lanes.mjs');
  assert.equal(twin?.env?.CI_FAST_LANE_GROUP, 'typecheck');
  assert.match(
    String(twin?.if),
    /steps\.mq-parity\.outputs\.typecheck == 'true'/
  );
  assert.match(String(twin?.if), /matrix\.shard == '2\/4'/);
  const remaining = unitSteps.find(step => step.name === REMAINING_TWIN);
  assert.equal(remaining?.run, 'node scripts/ci-fast-lanes.mjs');
  assert.equal(remaining?.env?.CI_FAST_LANE_GROUP, 'remaining');
  assert.equal(remaining?.env?.CI_FAST_SKIP_STRUCTURAL, 'true');
  assert.match(
    String(remaining?.if),
    /steps\.mq-parity\.outputs\.remaining == 'true'/
  );
  assert.match(String(remaining?.if), /matrix\.shard == '1\/4'/);
  // Observability-only artifact upload (JOV-12621): never blocks, never
  // uploads more than the retry sidecar, never fails on a missing file.
  const flaky = unitSteps.find(step => step.name === UNIT_FLAKY_UPLOAD);
  if (flaky) {
    assert.match(String(flaky.uses), /^actions\/upload-artifact@[a-f0-9]{40}/);
    assert.equal(flaky.with?.path, 'apps/web/test-report.*.flaky.json');
    assert.equal(flaky.with?.['if-no-files-found'], 'ignore');
    assert.match(String(flaky.with?.name), /^unit-flaky-/);
    assert.equal(flaky['continue-on-error'], undefined);
    assert.match(String(flaky.if), /steps\.reuse\.outputs\.reuse != 'true'/);
  }

  // The LFS screenshot catalog is pulled before the exact-head build, under
  // the build's own condition, restoring the object cache only.
  const coverageSteps = current.jobs.coverage.steps;
  const pull = coverageSteps.findIndex(
    step => step.name === PRODUCT_SCREENSHOTS
  );
  if (pull !== -1) {
    const build = coverageSteps[pull + 1];
    assert.equal(build?.name, 'Build exact PR head');
    assert.equal(coverageSteps[pull].uses, './.github/actions/lfs-pull');
    assert.deepEqual(coverageSteps[pull].with, {
      include: 'apps/web/screenshot-catalog/current/*.png',
      cache: 'restore',
    });
    assert.equal(coverageSteps[pull].if, build?.if);
  }

  const steps = current.jobs.deterministic.steps;
  const linearStep = steps.find(step => step.name === linear);
  assert.equal(linearStep.shell, 'bash');
  assert.match(linearStep.run, /linear-reference-requirement\.mjs/);
  assert.match(linearStep.env.LINEAR_API_KEY, /secrets\.LINEAR_API_KEY/);
  assert.equal(linearStep['continue-on-error'], undefined);
  const brandStep = steps.find(step => step.name === brand);
  assert.equal(brandStep.shell, 'bash');
  assert.equal(brandStep.if, undefined);
  assert.equal(brandStep['continue-on-error'], undefined);
  assert.deepEqual(brandStep.env, {
    PR_TITLE: '${{ github.event.pull_request.title }}',
    PR_BODY: '${{ github.event.pull_request.body }}',
    HEAD_SHA: '${{ github.event.pull_request.head.sha }}',
    BASE_BRANCH: '${{ github.base_ref }}',
  });
  assert.match(brandStep.run, /git archive "\$trusted_ref" scripts\/anti-slop/);
  assert.match(
    brandStep.run,
    /node "\$guard_root\/scripts\/anti-slop\/brand-name-messages\.mjs" "\$trusted_ref" "\$HEAD_SHA"/
  );
  assert.equal(
    current.jobs['cancel-superseded']['runs-on'],
    baseline.jobs.deterministic['runs-on']
  );
  assert.deepEqual(current.permissions, baseline.permissions);
  assert.deepEqual(current.on, baseline.on);
}

/** @param {Workflow} workflow @param {Workflow} baseline */
export function assertOriginalJobMutationRejection(workflow, baseline) {
  for (const mutate of [
    copy => {
      copy.jobs.deterministic.permissions = { contents: 'write' };
    },
    copy => {
      copy.jobs.deterministic.steps.find(
        step =>
          step.name === 'Check brand spelling in PR text and commit messages'
      ).if = 'false';
    },
    copy => {
      copy.jobs.deterministic['runs-on'] = 'changed-runner';
    },
    copy => {
      copy.jobs.deterministic.steps.shift();
    },
    copy => {
      copy.jobs.deterministic.steps.push({
        name: 'Unregistered extra step',
        run: 'true',
      });
    },
    copy => {
      copy.jobs.deterministic.steps.find(
        step =>
          step.name === 'Check brand spelling in PR text and commit messages'
      )['continue-on-error'] = true;
    },
  ]) {
    const copy = structuredClone(workflow);
    mutate(copy);
    assert.throws(
      () => assertOriginalJobsRetained(copy, baseline),
      assert.AssertionError
    );
  }
}
