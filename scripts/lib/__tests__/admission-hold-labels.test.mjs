import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { CONTRACT_LABELS } from '../../hold-contract.mjs';
import {
  ADMISSION_BLOCKING_LABELS,
  HOLD_LABELS_SCHEMA,
  parseHoldLabels,
  QUEUE_POISON_LABEL,
  STOP_HOLD_LABELS,
} from '../admission-hold-labels.mjs';
import { HOLD_LABELS as MEMBER_POLICY_HOLD_LABELS } from '../merge-group-member-policy.mjs';

const require = createRequire(import.meta.url);
const { load } = require('js-yaml');
/** @param {string} name @returns {any} */
const readWorkflow = name =>
  load(readFileSync(`.github/workflows/${name}`, 'utf8'));
const sorted = values => [...values].sort();
const quotedSet = (source, name) => {
  const match = source.match(
    new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`)
  );
  assert.ok(match, `${name} literal not found`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};

test('stop labels plus queue-poison make up the admission-blocking set', () => {
  assert.deepEqual(sorted(ADMISSION_BLOCKING_LABELS), [
    ...sorted([...STOP_HOLD_LABELS, QUEUE_POISON_LABEL]),
  ]);
  assert.deepEqual(sorted(CONTRACT_LABELS), sorted(STOP_HOLD_LABELS));
});

test('the JSON source has the shape every consumer, lanes included, reads', () => {
  const raw = JSON.parse(
    readFileSync('scripts/lib/admission-hold-labels.json', 'utf8')
  );
  assert.deepEqual(Object.keys(raw).sort(), [
    'queuePoisonLabel',
    'schema',
    'stopHoldLabels',
  ]);
  assert.equal(raw.schema, HOLD_LABELS_SCHEMA);
  assert.deepEqual(raw.stopHoldLabels, [...STOP_HOLD_LABELS]);
  assert.equal(raw.queuePoisonLabel, QUEUE_POISON_LABEL);
  const valid = { ...raw };
  for (const broken of [
    'not json',
    JSON.stringify({ ...valid, schema: 'v0' }),
    JSON.stringify({ ...valid, stopHoldLabels: [] }),
    JSON.stringify({ ...valid, stopHoldLabels: ['hold', 'hold'] }),
    JSON.stringify({ ...valid, stopHoldLabels: ['Hold'] }),
    JSON.stringify({ ...valid, stopHoldLabels: ['hold', ''] }),
    JSON.stringify({ ...valid, queuePoisonLabel: 'hold' }),
    JSON.stringify({ ...valid, queuePoisonLabel: null }),
  ]) {
    assert.throws(() => parseHoldLabels(broken));
  }
});

test('the merge-group member policy holds the same stop labels', () => {
  assert.deepEqual(sorted(MEMBER_POLICY_HOLD_LABELS), sorted(STOP_HOLD_LABELS));
});

test('every enroll, dequeue, and auto-merge copy matches the canonical set', () => {
  const enroll = readWorkflow('merge-queue-green-enroll.yml');
  const enrollScript = enroll.jobs.enroll.steps.find(s => s.with?.script).with
    .script;
  assert.match(enrollScript, /scripts\/lib\/admission-hold-labels\.json/);
  assert.match(
    enroll.jobs.enroll.steps.find(s => s.uses?.includes('checkout')).with[
      'sparse-checkout'
    ],
    /scripts\/lib\/admission-hold-labels\.json/
  );
  const dequeue = enroll.jobs['dequeue-held'];
  const ifList = JSON.parse(dequeue.if.match(/fromJSON\('(\[[^\]]*\])'\)/)[1]);
  assert.deepEqual(sorted(ifList), sorted(ADMISSION_BLOCKING_LABELS));
  const dequeueScript = dequeue.steps.find(s => s.with?.script).with.script;
  assert.deepEqual(
    sorted(quotedSet(dequeueScript, 'blocking')),
    sorted(ADMISSION_BLOCKING_LABELS)
  );
  const contract = enroll.jobs['enforce-hold-contract'].steps.find(s =>
    s.uses?.includes('checkout')
  );
  assert.match(
    contract.with['sparse-checkout'],
    /scripts\/lib\/admission-hold-labels\.json\n\s*scripts\/lib\/admission-hold-labels\.mjs/
  );

  const rearm = enroll.jobs['rearm-green-victims'].steps.find(s =>
    s.uses?.includes('checkout')
  );
  assert.match(
    rearm.with['sparse-checkout'],
    /scripts\/lib\/admission-hold-labels\.json\n\s*scripts\/lib\/admission-hold-labels\.mjs/
  );
});

// Auto-Merge Default was retired as a second queue writer; green enroll is the
// only active workflow that arms or enqueues, so a held head has one admission
// path to guard. agent-pipeline.yml is disabled_manually in GitHub and is
// deleted with the other dormant agent landing controllers.
test('merge-queue-green-enroll is the only workflow that arms or enqueues PRs', () => {
  const writers = readdirSync('.github/workflows')
    .filter(name => /\.ya?ml$/.test(name))
    .filter(name => {
      const source = readFileSync(`.github/workflows/${name}`, 'utf8')
        .split('\n')
        .filter(line => !/^\s*#/.test(line))
        .join('\n');
      return /\benqueuePullRequest\b|\bgh pr merge [^\n]*--auto\b|\benablePullRequestAutoMerge\b/.test(
        source
      );
    });
  // agent-pipeline.yml is tolerated only while it exists; deleting it must
  // not turn this red, and no other workflow may join it.
  assert.deepEqual(
    writers.filter(name => name !== 'agent-pipeline.yml'),
    ['merge-queue-green-enroll.yml']
  );
});

test('green enroll wakes on ready_for_review but never runs enroll for a draft event', () => {
  const enroll = readWorkflow('merge-queue-green-enroll.yml');
  assert.ok(enroll.on.pull_request_target.types.includes('ready_for_review'));
  assert.ok(enroll.on.pull_request_target.types.includes('synchronize'));
  assert.match(
    enroll.jobs.enroll.if,
    /github\.event_name != 'pull_request_target' \|\| github\.event\.pull_request\.draft == false/
  );
});
