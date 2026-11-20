import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  eventCondition,
  mergeGroupJobs,
  validateMqParity,
  validateRepositoryMqParity,
} from './mq-parity-manifest.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const root = resolve(import.meta.dirname, '../..');

/**
 * @typedef {{
 *   workflow: string,
 *   job: string,
 *   mq_step: string,
 *   pr_step: string,
 *   command: string,
 *   env?: Record<string, string>,
 * }} MqParityTwin
 * @typedef {{
 *   twins?: MqParityTwin[],
 *   needs_merged_tree?: { reason: string, inputs?: string[] },
 *   rollup_lanes?: string[],
 * }} MqParityJob
 * @typedef {{ jobs: Record<string, MqParityJob> }} MqParityManifest
 */
test('every reachable MQ job has a valid parity classification and command', () => {
  assert.deepEqual(validateRepositoryMqParity(root), []);
});

function fixture() {
  const workflow = load(
    `on:\n  merge_group:\njobs:\n  lane:\n    if: github.event_name == 'merge_group'\n    steps:\n      - name: Run lane\n        run: node scripts/check.mjs\n`
  );
  const pr = load(
    `on:\n  pull_request:\njobs:\n  source:\n    steps:\n      - name: Run source\n        run: node scripts/check.mjs\n`
  );
  /** @type {MqParityManifest} */
  const manifest = {
    jobs: {
      lane: {
        twins: [
          {
            workflow: '.github/workflows/source.yml',
            job: 'source',
            mq_step: 'Run lane',
            pr_step: 'Run source',
            command: 'node scripts/check.mjs',
          },
        ],
      },
    },
  };
  return { workflow, pr, manifest };
}

test('a newly introduced MQ lane fails until classified, even with unknown path outputs', () => {
  const { workflow, pr, manifest } = fixture();
  workflow.jobs.added = {
    if: "github.event_name == 'merge_group' && needs.paths.outputs.run == 'true'",
  };
  assert.match(
    validateMqParity(manifest, workflow, () => pr).join('\n'),
    /added: missing/
  );
});

test('event restrictions exclude manual and source-only jobs while preserving conditional MQ lanes', () => {
  /** @type {Array<[string, boolean | null]>} */
  const cases = [
    ["github.event_name == 'workflow_dispatch'", false],
    ["always() && github.event_name == 'pull_request'", false],
    ["${{ github.event_name == 'merge_group' }}", true],
    [
      "always() && (github.event_name == 'workflow_dispatch' || (github.event_name == 'merge_group' && needs.paths.outputs.web == 'true'))",
      null,
    ],
    [
      "github.event_name != 'merge_group' || needs.workspace.result == 'success'",
      null,
    ],
    ["!cancelled() && needs.paths.result == 'success'", null],
    ["!(github.event_name == 'merge_group')", false],
  ];
  for (const [condition, expected] of cases)
    assert.equal(eventCondition(condition), expected, condition);
  const workflow = load(
    readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
  );
  assert.ok(!mergeGroupJobs(workflow).includes('ci-pr-ready'));
  assert.ok(mergeGroupJobs(workflow).includes('ci-merge-group-ready'));
});

test('broken workflows, removed commands, skipped PR twins and changed selectors fail', () => {
  for (const change of [
    ({ pr }) => {
      delete pr.jobs.source;
    },
    ({ pr }) => {
      delete pr.on.pull_request;
    },
    ({ pr }) => {
      pr.jobs.source.if = "github.event_name == 'workflow_dispatch'";
    },
    ({ pr }) => {
      pr.jobs.source.steps[0].run = 'node scripts/different.mjs';
    },
    ({ pr }) => {
      pr.jobs.source.steps[0]['continue-on-error'] = true;
    },
    ({ manifest }) => {
      manifest.jobs.lane.twins[0].env = { MODE: 'only' };
    },
  ]) {
    const state = fixture();
    change(state);
    assert.ok(
      validateMqParity(state.manifest, state.workflow, () => state.pr).length >
        0
    );
  }
});

test('merged-tree reasons name actual inputs and rollups name existing underlying lanes', () => {
  const { workflow, manifest } = fixture();
  /** @type {Array<{ reason: string, inputs?: string[] }>} */
  const reasons = [
    { reason: 'Needs merged tree' },
    {
      reason: 'Needs merged tree',
      inputs: ['github.event.merge_group.head_sha'],
    },
    { reason: 'input invented', inputs: ['invented'] },
    { reason: 'needs.missing.result', inputs: ['needs.missing.result'] },
  ];
  for (const reason of reasons) {
    manifest.jobs.lane = { needs_merged_tree: reason };
    assert.ok(validateMqParity(manifest, workflow, () => {}).length > 0);
  }
  manifest.jobs.lane = {
    needs_merged_tree: {
      reason: 'Validate github.event.merge_group.head_sha migration ordering',
      inputs: ['github.event.merge_group.head_sha'],
    },
  };
  assert.deepEqual(
    validateMqParity(manifest, workflow, () => {}),
    []
  );
  manifest.jobs.lane.rollup_lanes = ['missing'];
  assert.match(
    validateMqParity(manifest, workflow, () => {}).join('\n'),
    /missing underlying rollup lane/
  );
});
