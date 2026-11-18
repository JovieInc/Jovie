import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { configurationPaths } from '../../scripts/lib/mutation-inputs.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync(
    process.env.MUTATION_WORKFLOW_PATH ??
      `${root}/.github/workflows/mutation-diff.yml`,
    'utf8'
  )
);
const steps = workflow.jobs.sweep.steps;
const step = name => {
  const value = steps.find(s => s.name === name);
  assert.ok(value, `Missing ${name}`);
  return value;
};
const position = name => steps.indexOf(step(name));

it('keeps one canonical scoring job and the original event/pool/bounds', () => {
  assert.deepEqual(workflow.on.workflow_run.workflows, ['CI']);
  assert.equal(workflow.on.schedule, undefined);
  assert.deepEqual(workflow.jobs.sweep['runs-on'], [
    'self-hosted',
    'Linux',
    'X64',
    'jovie-fixed',
  ]);
  assert.deepEqual(workflow.jobs.sweep.concurrency, {
    group: 'mutation-sweep',
    'cancel-in-progress': false,
  });
  assert.equal(workflow.jobs.sweep['timeout-minutes'], 120);
  const score = step('Score the next modules');
  assert.match(score.run, /flock -n 9/u);
  assert.match(score.run, /--max-minutes 10 --file-timeout-minutes 5/u);
  assert.match(score.run, /--max-minutes 75/u);
  assert.equal(score.env.STRYKER_CONCURRENCY, '1');
  assert.equal(score.env.GH_TOKEN, undefined);
});

it('authenticates a durable claim before the existing scorer and retains capacity/lock gates', () => {
  const claim = step('Reserve immutable next-target claim');
  assert.match(claim.uses, /^actions\/upload-artifact@/u);
  assert.equal(claim.with['if-no-files-found'], 'error');
  for (const predecessor of [
    'Select reviewed next target',
    'Reserve immutable next-target claim',
    'Verify immutable next-target claim',
    'Recheck target runner capacity',
  ])
    assert.ok(position(predecessor) < position('Score the next modules'));
  const score = step('Score the next modules');
  assert.match(score.if, /next_target.outputs.hold != 'true'/u);
  assert.match(score.if, /target_verified.outputs.verified == 'true'/u);
  assert.match(score.if, /target_capacity.outputs.run == 'true'/u);
  assert.ok(
    score.run.indexOf('flock -n 9') <
      score.run.indexOf('mutation-next-target-cli.mjs begin')
  );
  assert.ok(
    score.run.indexOf('mutation-next-target-cli.mjs begin') <
      score.run.indexOf('nice -n 19 node scripts/mutation-sweep.mjs')
  );
});

it('uses sweep selection for a handoff even when its carrier was incremental', () => {
  const expression = step('Score the next modules').env.MODE.replace(
    /^\$\{\{\s*|\s*\}\}$/gu,
    ''
  );
  assert.equal(
    runInNewContext(expression, {
      github: { event_name: 'workflow_dispatch' },
      inputs: { mode: 'incremental' },
      steps: { next_target: { outputs: { selected: 'true' } } },
    }),
    'sweep'
  );
});

it('binds request outcome to the same canonical state/artifact publication', () => {
  const snapshot = step('Snapshot sweep state and survivor tasks');
  assert.match(snapshot.run, /next-target-ledger.json/u);
  assert.match(snapshot.run, /next-target-result.json/u);
  assert.match(snapshot.run, /nextTargetResultSha256/u);
  for (const predecessor of [
    'Snapshot sweep state and survivor tasks',
    'Save sweep state',
    'Upload sweep state and survivor tasks',
  ])
    assert.ok(position(predecessor) < position('Verify canonical publication'));
  assert.match(
    step('Verify canonical publication').if,
    /save_state.outcome == 'success'/u
  );
  assert.match(
    step('Verify canonical publication').if,
    /upload_state.outcome == 'success'/u
  );
});

it('publishes an immutable outbox after canonical publication and before one wake', () => {
  assert.ok(
    position('Verify canonical publication') <
      position('Reserve immutable continuation')
  );
  assert.ok(
    position('Reserve immutable continuation') <
      position('Chain the next batch')
  );
  assert.match(
    step('Chain the next batch').if,
    /continuation.outcome == 'success'/u
  );
  assert.match(
    step('Chain the next batch').run,
    /mutation-next-target-cli.mjs dispatch/u
  );
  assert.equal(
    step('Reserve immutable continuation').with['if-no-files-found'],
    'error'
  );
});

it('keeps orchestration additions outside the existing scoring recipe', () => {
  assert.deepEqual(
    configurationPaths(
      [
        '.github/scripts/mutation-next-target.mjs',
        '.github/scripts/mutation-next-target-cli.mjs',
        '.github/mutation-next-targets.json',
      ],
      'packages/ui'
    ),
    configurationPaths([], 'packages/ui')
  );
  const accepted = JSON.parse(
    readFileSync(`${root}/.github/mutation-next-targets.json`, 'utf8')
  );
  assert.equal(accepted.schema, 'jovie.mutation-next-targets/v1');
  assert.equal(accepted.requests.length, 1);
  assert.equal(accepted.requests[0].file, 'packages/ui/atoms/form.tsx');
  assert.equal(accepted.requests[0].maxFiles, 1);
});
