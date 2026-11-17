import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

export function assertSourceProofReuseContract(workflow) {
  const gate = "steps.reuse.outputs.reuse != 'true'";
  const assertDocsCondition = (step, expected, unit = false) => {
    for (const reuse of [undefined, 'false', 'true'])
      for (const docsOnly of [undefined, 'false', 'true', 'invalid'])
        for (const shard of unit ? ['1/4', '2/4', '3/4', '4/4'] : ['4/4'])
          for (const mask of unit ? [0, 1, 2, 3, 4, 5, 6, 7] : [0]) {
            const state = {
              reuse,
              docsOnly,
              shard,
              web: Boolean(mask & 1),
              ui: Boolean(mask & 2),
              ovie: Boolean(mask & 4),
            };
            const actual = runInNewContext(step.if, {
              matrix: { shard },
              steps: {
                reuse: { outputs: { reuse } },
                source_docs: { outputs: { docs_only: docsOnly } },
                scope: {
                  outputs: Object.fromEntries(
                    ['web', 'ui', 'ovie'].map(key => [key, String(state[key])])
                  ),
                },
              },
            });
            assert.equal(
              actual,
              expected(state),
              `${step.name}: ${reuse}/${docsOnly}/${shard}/${mask}`
            );
          }
  };
  const [client, prime, runtime, reuseStep] = workflow.jobs.deterministic.steps;
  assert.equal(client.with.ref, '${{ github.event.pull_request.base.sha }}');
  assert.equal(client.with['persist-credentials'], false);
  assert.match(client.with['sparse-checkout'], /packages\/api-client/);
  assert.equal(
    runtime.with['node-version-file'],
    '.source-validation-client/.nvmrc'
  );
  // The quota-client runtime is primed from nodejs.org so a metadata edit does
  // not spend a GITHUB_TOKEN manifest call in each of the jobs (2026-10-25).
  assert.match(prime.run, /prime-node-toolcache\/prime\.sh/);
  assert.equal(prime.env.NODE_VERSION_FILE, '.source-validation-client/.nvmrc');
  assert.match(
    client.with['sparse-checkout'],
    /prime-node-toolcache\/prime\.sh/
  );
  assert.equal(client.if, reuseStep.if);
  assert.match(prime.if, /github\.event\.action == 'edited'/);
  assert.equal(runtime.if, reuseStep.if);
  assert.equal(reuseStep.id, 'reuse');
  // Base retargets change the compared tree, so they never reuse a proof.
  // Label changes leave the tree untouched, so they reuse it too (#23748).
  assert.equal(
    reuseStep.if,
    "${{ (github.event.action == 'edited' && !github.event.changes.base) || github.event.action == 'labeled' || github.event.action == 'unlabeled' }}"
  );
  for (const job of ['security', 'migration', 'coverage', 'unit']) {
    const [jobClient, jobPrime, jobRuntime, first, ...rest] =
      workflow.jobs[job].steps;
    assert.deepEqual(jobClient, client, job);
    assert.deepEqual(jobPrime, prime, job);
    assert.deepEqual(jobRuntime, runtime, job);
    assert.equal(first.id, 'reuse', job);
    assert.ok(workflow.jobs[job].permissions.actions === 'read', job);
    // Coverage/unit lanes and the trusted Dependabot handoff narrow further;
    // none may run on a reused metadata-only edit. Check every handoff case
    // rather than accepting an arbitrary condition after the reuse predicate.
    for (const step of rest) {
      if (job === 'unit') {
        const guardStart = rest.findIndex(
          item => item.id === 'source_guard_merge'
        );
        if (rest.indexOf(step) >= guardStart) {
          assert.match(step.if, /matrix\.shard == '4\/4'/, step.name);
          continue; // Executable matrix/cleanup coverage lives in the generation suite.
        }
        if (
          [
            'Checkout exact source head for unit and merged guard proofs',
            'Fetch head and base history only',
          ].includes(step.name)
        ) {
          assert.equal(step.if, `${gate} || matrix.shard == '4/4'`);
          continue;
        }
        if (
          [
            'Prime the pinned source runtime before classification',
            'Select the pinned source runtime without dependency hydration',
            'Classify exact source docs before dependency setup',
          ].includes(step.name)
        ) {
          assertDocsCondition(step, ({ shard }) => shard === '4/4', true);
          continue;
        }
        if (step.name === 'Validate docs contracts in the merged-guard slot') {
          assertDocsCondition(
            step,
            ({ shard, docsOnly }) => shard === '4/4' && docsOnly === 'true',
            true
          );
          continue;
        }
        if (
          ['Setup Node.js and pnpm', 'Setup Playwright warm path'].includes(
            step.name
          )
        ) {
          assertDocsCondition(
            step,
            ({ shard, docsOnly, reuse, web, ui, ovie }) =>
              (shard === '4/4' && docsOnly !== 'true') ||
              (reuse !== 'true' &&
                (web ||
                  (step.name === 'Setup Node.js and pnpm' && (ui || ovie)))),
            true
          );
          continue;
        }
      }
      if (step.name === 'Setup dependencies for applicable source contracts') {
        assertDocsCondition(
          step,
          ({ reuse, docsOnly }) => reuse !== 'true' && docsOnly !== 'true'
        );
        continue;
      }
      if (
        job === 'security' &&
        [
          'Mint dependency review read token',
          'Review added and upgraded dependencies',
        ].includes(step.name)
      ) {
        assert.equal(
          step.if,
          `${gate} && (github.event.pull_request.user.login != 'dependabot[bot]' || github.event.pull_request.base.ref != 'main')`
        );
        for (const reuse of ['true', 'false'])
          for (const login of ['dependabot[bot]', 'human'])
            for (const ref of ['main', 'integration/test']) {
              const actual = runInNewContext(step.if, {
                steps: { reuse: { outputs: { reuse } } },
                github: {
                  event: { pull_request: { user: { login }, base: { ref } } },
                },
              });
              const expected =
                reuse !== 'true' &&
                !(login === 'dependabot[bot]' && ref === 'main');
              assert.equal(
                actual,
                expected,
                `${step.name}: reuse=${reuse}, author=${login}, base=${ref}`
              );
            }
        continue;
      }
      assert.ok(
        step.if === gate ||
          (job === 'coverage' &&
            step.if === `${gate} && steps.scope.outputs.build == 'true'`) ||
          (job === 'unit' && step.if?.startsWith(`${gate} && `)),
        `${job}: ${step.name ?? step.uses}`
      );
    }
  }
  const always = ['Validate customer changelog decision from trusted base'];
  // Fleet evidence is a status read in `ready`, produced by the base-branch
  // Fleet Rules Evidence workflow; it never depends on proof reuse.
  assert.ok(
    workflow.jobs.ready.steps.some(
      step => step.name === 'Require fleet-rule evidence'
    )
  );
  const deterministic = workflow.jobs.deterministic.steps;
  for (const name of always) {
    const step = deterministic.find(candidate => candidate.name === name);
    assert.ok(step, name);
    assert.equal(
      step.if,
      undefined,
      `${name} must run on a metadata-only edit`
    );
  }
  for (const name of [
    'Setup Playwright (Chromium)',
    'Measure actual installed source dependency graph',
    'Preserve exact source dependency evidence',
  ])
    assertDocsCondition(
      deterministic.find(step => step.name === name),
      ({ docsOnly }) => docsOnly !== 'true'
    );
  assertDocsCondition(
    deterministic.find(
      step => step.name === 'Run deterministic source contract'
    ),
    ({ reuse, docsOnly }) => reuse !== 'true' && docsOnly !== 'true'
  );
  assertDocsCondition(
    deterministic.find(
      step =>
        step.name ===
        'Validate applicable docs contracts without workspace dependencies'
    ),
    ({ docsOnly }) => docsOnly === 'true'
  );
  // Every step that can launch Chromium runs after the browser setup and is
  // never broader than it.
  const names = deterministic.map(step => step.name);
  const setup = names.indexOf('Setup Playwright (Chromium)');
  for (const name of ['Run deterministic source contract']) {
    assert.ok(setup >= 0 && names.indexOf(name) > setup, name);
    // The truth tables above prove the contract only runs on a full path,
    // and every full path provisions Chromium even on metadata proof reuse.
  }
  assert.equal(
    workflow.jobs.ready.steps[0].run,
    'test "$RESULTS" = \'success,success,success,success,success,success\''
  );
}
