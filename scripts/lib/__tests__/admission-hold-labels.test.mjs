import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { CONTRACT_LABELS } from '../../hold-contract.mjs';
import {
  ADMISSION_BLOCKING_LABELS,
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

test('the merge-group member policy and the lanes hold the same stop labels', () => {
  assert.deepEqual(sorted(MEMBER_POLICY_HOLD_LABELS), sorted(STOP_HOLD_LABELS));
  const lanes = readFileSync('scripts/lanes/pr_events.py', 'utf8').match(
    /^HOLD_LABELS = frozenset\(\{([^}]*)\}\)/m
  );
  assert.ok(lanes, 'pr_events.py HOLD_LABELS literal not found');
  assert.deepEqual(
    sorted([...lanes[1].matchAll(/"([^"]+)"/g)].map(m => m[1])),
    sorted(STOP_HOLD_LABELS)
  );
});

test('every enroll, dequeue, and auto-merge copy matches the canonical set', () => {
  const enroll = readWorkflow('merge-queue-green-enroll.yml');
  const enrollScript = enroll.jobs.enroll.steps.find(s => s.with?.script).with
    .script;
  assert.deepEqual(
    sorted(quotedSet(enrollScript, 'BLOCKING')),
    sorted(ADMISSION_BLOCKING_LABELS)
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
    /scripts\/lib\/admission-hold-labels\.mjs/
  );

  const enable = readWorkflow('auto-merge-default.yml').jobs.enable.steps.find(
    s => s.name === 'Enable auto-merge'
  ).run;
  assert.deepEqual(
    sorted([...enable.matchAll(/\. == "([^"]+)"/g)].map(m => m[1])),
    sorted(ADMISSION_BLOCKING_LABELS)
  );

  const {
    BLOCKING_LABELS,
  } = require('../../../.github/scripts/customer-notes-ready.js');
  assert.deepEqual(sorted(BLOCKING_LABELS), sorted(ADMISSION_BLOCKING_LABELS));
});

// Runs the real enable step against a fake gh: a held PR must never be armed,
// because arming a CLEAN PR enqueues it and a held member fails every group.
function runEnable(labels) {
  const dir = mkdtempSync(join(tmpdir(), 'auto-merge-enable-'));
  try {
    const log = join(dir, 'calls.log');
    const fake = join(dir, 'gh');
    writeFileSync(
      fake,
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
jq_expr=""; json=""
while [ $# -gt 0 ]; do
  case "$1" in
    --jq) jq_expr="$2"; shift ;;
    --json) json="$2"; shift ;;
  esac
  shift
done
case "$json" in
  labels) printf '%s' '{"labels":${JSON.stringify(labels.map(name => ({ name })))}}' | jq -r "$jq_expr" ;;
  headRefOid) echo ${'a'.repeat(40)} ;;
  autoMergeRequest) echo "" ;;
  "") echo '[[]]' ;;
esac
`
    );
    chmodSync(fake, 0o755);
    const run = readWorkflow('auto-merge-default.yml').jobs.enable.steps.find(
      s => s.name === 'Enable auto-merge'
    ).run;
    const result = spawnSync('bash', ['-c', run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        GH_TOKEN: 'token',
        PR_NUMBER: '7',
        HEAD_REPO: 'JovieInc/Jovie',
        BASE_REPO: 'JovieInc/Jovie',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return {
      stdout: result.stdout,
      merged: readFileSync(log, 'utf8')
        .split('\n')
        .some(line => line.startsWith('pr merge 7')),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('the auto-merge enable step skips held PRs and arms unheld ones', () => {
  for (const label of ['tim:hold', 'Gated', 'queue-poison']) {
    const held = runEnable(['ui', label]);
    assert.equal(held.merged, false, label);
    assert.match(held.stdout, /admission-blocking label/);
  }
  assert.equal(runEnable(['ui']).merged, true);
});
