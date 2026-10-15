import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { test } from 'node:test';
import { CONTRACT_LABELS } from '../../hold-contract.mjs';
import {
  ADMISSION_BLOCKING_LABELS,
  HOLD_LABELS_SCHEMA,
  MACHINE_BLOCK_LABELS,
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

test('stop labels, queue-poison, and machine blocks make up the admission-blocking set', () => {
  assert.deepEqual(sorted(ADMISSION_BLOCKING_LABELS), [
    ...sorted([
      ...STOP_HOLD_LABELS,
      QUEUE_POISON_LABEL,
      ...MACHINE_BLOCK_LABELS,
    ]),
  ]);
  assert.deepEqual(MACHINE_BLOCK_LABELS, ['lane-fix-red']);
  assert.equal(STOP_HOLD_LABELS.includes('lane-fix-red'), false);
  assert.equal(CONTRACT_LABELS.includes('lane-fix-red'), false);
  assert.deepEqual(sorted(CONTRACT_LABELS), sorted(STOP_HOLD_LABELS));
});

test('the JSON source has the shape every consumer, lanes included, reads', () => {
  const raw = JSON.parse(
    readFileSync('scripts/lib/admission-hold-labels.json', 'utf8')
  );
  assert.deepEqual(Object.keys(raw).sort(), [
    'machineBlockLabels',
    'queuePoisonLabel',
    'schema',
    'stopHoldLabels',
  ]);
  assert.equal(raw.schema, HOLD_LABELS_SCHEMA);
  assert.deepEqual(raw.stopHoldLabels, [...STOP_HOLD_LABELS]);
  assert.equal(raw.queuePoisonLabel, QUEUE_POISON_LABEL);
  assert.deepEqual(raw.machineBlockLabels, [...MACHINE_BLOCK_LABELS]);
  const valid = { ...raw };
  const withoutMachine = { ...valid };
  delete withoutMachine.machineBlockLabels;
  for (const broken of [
    'not json',
    JSON.stringify({ ...valid, schema: 'v0' }),
    JSON.stringify({ ...valid, stopHoldLabels: [] }),
    JSON.stringify({ ...valid, stopHoldLabels: ['hold', 'hold'] }),
    JSON.stringify({ ...valid, stopHoldLabels: ['Hold'] }),
    JSON.stringify({ ...valid, stopHoldLabels: ['hold', ''] }),
    JSON.stringify({ ...valid, queuePoisonLabel: 'hold' }),
    JSON.stringify({ ...valid, queuePoisonLabel: null }),
    JSON.stringify(withoutMachine),
    JSON.stringify({ ...valid, machineBlockLabels: [] }),
    JSON.stringify({
      ...valid,
      machineBlockLabels: ['lane-fix-red', 'lane-fix-red'],
    }),
    JSON.stringify({ ...valid, machineBlockLabels: ['Lane-Fix-Red'] }),
    JSON.stringify({ ...valid, machineBlockLabels: ['hold'] }),
    JSON.stringify({ ...valid, machineBlockLabels: ['queue-poison'] }),
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
  assert.match(enrollScript, /holdLabels\.machineBlockLabels/);
  assert.doesNotMatch(enrollScript, /CLEARED stale lane-fix-red/);
  assert.doesNotMatch(enrollScript, /name: 'lane-fix-red'/);
  const relaySource = readFileSync('scripts/lanes/pr_events.py', 'utf8');
  assert.match(relaySource, /LANE_FIX_RED = PREFIX \+ "red"/);
  assert.match(relaySource, /labels\/\{LANE_FIX_RED\}/);
  const relayWorkflow = readWorkflow('lane-fix-relay.yml');
  assert.equal(relayWorkflow.jobs.relay.permissions.issues, 'write');
  assert.equal(relayWorkflow.jobs.relay.permissions['pull-requests'], 'write');
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
// A queue writer enqueues, or arms native auto-merge (GitHub enqueues an armed
// PR when it turns green, even after the arming workflow is disabled).
const QUEUE_WRITE =
  /\benqueuePullRequest\b|\benablePullRequestAutoMerge\b|\bpr merge\b[^\n]*\s--auto\b|['"]--auto['"]/;
// Interpreter-invoked scripts only: a path in a string map or a test is not a call.
const RUN = String.raw`(?:node|bash|sh|python3?|tsx)\s+(?:-[\w=.-]+\s+)*["']?`;
const SCRIPT = String.raw`[\w./-]+\.(?:mjs|cjs|js|sh|py)`;
const uncommented = text =>
  text
    .split('\n')
    .filter(line => !/^\s*(#|\/\/|\*)/.test(line))
    .join('\n');
const invokedScripts = (path, source, root) =>
  [
    ...[
      ...source.matchAll(
        new RegExp(`${RUN}((?:\\.github\\/)?scripts\\/${SCRIPT})`, 'g')
      ),
    ].map(m => join(root, m[1])),
    ...[
      ...source.matchAll(
        new RegExp(`${RUN}\\$\\{?(?:SCRIPT_DIR|HERE)\\}?\\/(${SCRIPT})`, 'g')
      ),
    ].map(m => normalize(join(dirname(path), m[1]))),
  ].filter(ref => !/__tests__|\/tests\/|\.test\./.test(ref));
/** @returns {string[] | null} the call chain that reaches a queue write */
const queueWriteChain = (path, root = '.', seen = new Set(), chain = []) => {
  if (seen.has(path) || chain.length > 4 || !existsSync(path)) return null;
  seen.add(path);
  const source = uncommented(readFileSync(path, 'utf8'));
  if (QUEUE_WRITE.test(source)) return [...chain, path];
  for (const ref of invokedScripts(path, source, root)) {
    const hit = queueWriteChain(ref, root, seen, [...chain, path]);
    if (hit) return hit;
  }
  return null;
};

// Auto-Merge Default was retired as a second queue writer; green enroll is the
// only active workflow that arms or enqueues, so a held head has one admission
// path to guard. The scan follows invoked scripts, so a writer cannot hide
// behind `run: node scripts/...`.
test('merge-queue-green-enroll is the only workflow that arms or enqueues PRs', () => {
  const writers = readdirSync('.github/workflows')
    .filter(name => /\.ya?ml$/.test(name))
    .map(name => queueWriteChain(`.github/workflows/${name}`))
    .filter(Boolean)
    .map(chain => chain.join(' -> '));
  // Tolerated only while they exist (both disabled_manually in GitHub); deleting
  // them must not turn this red, and no other workflow may join them.
  const dormant = [
    '.github/workflows/agent-pipeline.yml',
    '.github/workflows/rolling-ci-dispatch.yml',
  ];
  assert.deepEqual(
    writers.filter(chain => !dormant.some(name => chain.startsWith(name))),
    ['.github/workflows/merge-queue-green-enroll.yml']
  );
});

test('the queue-writer scan follows invoked scripts but not mentions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'queue-writer-scan-'));
  try {
    mkdirSync(join(dir, 'scripts'));
    const at = name => join(dir, name);
    writeFileSync(at('scripts/arm.sh'), 'gh pr merge "$n" -R "$R" --auto\n');
    writeFileSync(at('scripts/hop.sh'), 'bash "$SCRIPT_DIR/arm.sh"\n');
    writeFileSync(at('scripts/off.sh'), 'gh pr merge "$n" --disable-auto\n');
    writeFileSync(at('run.yml'), 'run: bash scripts/hop.sh\n');
    writeFileSync(
      at('note.yml'),
      '# bash scripts/arm.sh\nrun: echo scripts/arm.sh\n'
    );
    writeFileSync(at('off.yml'), 'run: bash scripts/off.sh\n');
    assert.deepEqual(queueWriteChain(at('run.yml'), dir), [
      at('run.yml'),
      at('scripts/hop.sh'),
      at('scripts/arm.sh'),
    ]);
    assert.equal(queueWriteChain(at('note.yml'), dir), null);
    assert.equal(queueWriteChain(at('off.yml'), dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

// Agents defer PRs with `queue-deferred`; the sole queue writer must honor it
// like any other stop label (queue writer consolidation, 2026-10-13).
test('queue-deferred blocks admission and is governed by the hold contract', () => {
  assert.ok(STOP_HOLD_LABELS.includes('queue-deferred'));
  assert.ok(ADMISSION_BLOCKING_LABELS.includes('queue-deferred'));
  assert.ok(CONTRACT_LABELS.includes('queue-deferred'));
  assert.ok(MEMBER_POLICY_HOLD_LABELS.has('queue-deferred'));
});
