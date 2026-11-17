/** Native admission preserves accepted queue order, including builds starting after a read. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const { load } = createRequire(import.meta.url)('js-yaml');
const pin = JSON.parse(read('scripts/invariants/jump-policy-pin.json'));
const workflow = load(read('.github/workflows/merge-queue-green-enroll.yml'));
const script = workflow.jobs.enroll.steps.find(step => step.with?.script).with
  .script;
const normalize = text => text.replace(/\s+/g, '');
const sha256 = text => createHash('sha256').update(text).digest('hex');

function validateAdmission(source) {
  assert.equal([...source.matchAll(/\bjump\s*:/g)].length, pin.jumpTrueSites);
  assert.equal(
    [...source.matchAll(/\bdequeuePullRequest\s*\(/g)].length,
    pin.priorityDequeueSites
  );
  const inputs = [
    ...source.matchAll(/enqueuePullRequest\(input:\s*\{([^}]+)\}\)/g),
  ];
  assert.equal(inputs.length, 1, 'one canonical ordinary enqueue site');
  assert.equal(sha256(normalize(inputs[0][1])), pin.enqueueInputSha256);
  assert.equal(
    normalize(inputs[0][1]),
    'pullRequestId:$id,expectedHeadOid:$oid'
  );
}

test('native order pin requires zero automatic jump and priority-dequeue sites', () => {
  assert.equal(pin.schema, 'jovie-jump-policy-pin/v2');
  assert.deepEqual(Object.keys(pin).sort(), [
    'MARKETING_LABEL',
    'enqueueInputSha256',
    'jumpTrueSites',
    'priorityDequeueSites',
    'schema',
  ]);
  assert.equal(pin.jumpTrueSites, 0);
  assert.equal(pin.priorityDequeueSites, 0);
  validateAdmission(script);
});

test('the order guard rejects reset-capable mutations and missing exact-head binding', () => {
  for (const unsafe of [
    script.replace(
      'expectedHeadOid: $oid',
      'expectedHeadOid: $oid, jump: true'
    ),
    script + '\ndequeuePullRequest(input: { id: $id })',
    script.replace('expectedHeadOid: $oid', 'expectedHeadOid: $other'),
  ])
    assert.throws(() => validateAdmission(unsafe));
});

test('existing entries have an explicit non-mutating membership disposition', () => {
  assert.ok(
    script.includes(
      "receipt(pr, 'skip', 'already-enqueued:position-preserved')"
    )
  );
  assert.ok(script.includes('if (pr?.isInMergeQueue)'));
});

test('marketing retains its existing intake label without a native reorder route', () => {
  assert.ok(
    script.includes(`const MARKETING_LABEL = '${pin.MARKETING_LABEL}';`)
  );
  assert.ok(
    read('scripts/lanes/priority_admission.py').includes(
      `MARKETING_LABEL = "${pin.MARKETING_LABEL}"`
    )
  );
});

test('the order pin remains registered and watched by the gate-change audit', () => {
  const guards = read('scripts/ci-fast-lanes.mjs');
  assert.ok(guards.includes("id: 'jump-policy-pin'"));
  const watched = JSON.parse(
    read('scripts/invariants/gate-weakening-detector.config.json')
  ).jumpPolicyPin;
  assert.equal(watched.guardId, 'jump-policy-pin');
  assert.ok(watched.paths.includes('scripts/invariants/jump-policy-pin.json'));
  assert.ok(
    watched.paths.includes('scripts/invariants/jump-policy-pin.test.mjs')
  );
});
