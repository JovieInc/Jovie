import assert from 'node:assert/strict';

/** @typedef {{name?: string, shell?: string, if?: string, run?: string, env?: Record<string, string>, 'continue-on-error'?: boolean}} Step */
/** @typedef {{steps: Step[], 'runs-on'?: string}} Job */
/** @typedef {{jobs: Record<string, Job>, permissions: unknown, on: unknown}} Workflow */

/** Exact preservation of existing jobs, with only validated owned additions.
 * @param {Workflow} current
 * @param {Workflow} baseline
 */
export function assertOriginalJobsRetained(current, baseline) {
  const linear = 'Require a Linear issue reference from trusted base';
  const brand = 'Check brand spelling in PR text and commit messages';
  const owned = new Set([linear, brand]);
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
    assert.deepEqual(strip(actual), strip(job), id);
    for (const name of owned) {
      const added = actual.steps.filter(step => step.name === name);
      const kept = job.steps.filter(step => step.name === name);
      const firstLanding =
        id === 'deterministic' && !kept.length && added.length === 1;
      assert.ok(kept.length === added.length || firstLanding, `${id}: ${name}`);
      if (kept.length) assert.deepEqual(added, kept, `${id}: ${name}`);
    }
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
