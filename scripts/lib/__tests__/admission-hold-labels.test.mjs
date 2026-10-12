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
function runEnable(labels, { isDraft = false, env: extraEnv = {} } = {}) {
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
  state,isDraft) printf '%s' '{"state":"OPEN","isDraft":${isDraft}}' | jq -r "$jq_expr" ;;
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
        ...extraEnv,
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

test('a Source Validation completion re-arms a missed same-repo enable but never a draft', () => {
  const enable = readWorkflow('auto-merge-default.yml');
  assert.deepEqual(enable.on.workflow_run, {
    workflows: ['Source Validation', 'PR Size Guard', 'Fork PR Gate'],
    types: ['completed'],
  });
  assert.ok(enable.on.pull_request.types.includes('synchronize'));
  assert.match(
    enable.jobs.enable.if,
    /workflow_run\.pull_requests\[0\]\.number != null/
  );
  assert.match(
    enable.jobs.enable.if,
    /head_repository\.full_name == github\.repository/
  );
  assert.equal(runEnable([], { isDraft: true }).merged, false);
  assert.equal(runEnable([]).merged, true);
});

// Minimal GitHub Actions expression evaluator for the job `if:`s below:
// literals, context paths, ==, !=, !, &&, ||, parentheses, contains,
// startsWith and fromJSON. Comparisons ignore case, as Actions does.
function evaluateIf(expression, context) {
  const fold = value =>
    typeof value === 'string' ? value.toLowerCase() : value;
  const fns = {
    contains: (haystack, needle) =>
      Array.isArray(haystack)
        ? haystack.map(fold).includes(fold(needle))
        : String(fold(haystack) ?? '').includes(String(fold(needle))),
    startsWith: (value, prefix) =>
      String(fold(value) ?? '').startsWith(String(fold(prefix))),
    fromJSON: value => JSON.parse(value),
  };
  const tokens =
    expression.match(/'[^']*'|==|!=|&&|\|\||!|\(|\)|,|[A-Za-z_][\w.\-[\]]*/g) ??
    [];
  const source = tokens
    .map((token, index) => {
      if (token.startsWith("'"))
        return JSON.stringify(fold(token.slice(1, -1)));
      if (token === '==') return '===';
      if (token === '!=') return '!==';
      if (['&&', '||', '!', '(', ')', ','].includes(token)) return token;
      if (['null', 'true', 'false'].includes(token)) return token;
      if (tokens[index + 1] === '(') return `fns.${token}`;
      return `fold(ctx[${JSON.stringify(token)}] ?? null)`;
    })
    .join(' ');
  return Boolean(
    new Function('ctx', 'fns', 'fold', `return (${source});`)(
      context,
      fns,
      fold
    )
  );
}

const SAME_REPO_PR = {
  'github.event_name': 'pull_request',
  'github.repository': 'JovieInc/Jovie',
  'github.event.pull_request.draft': false,
  'github.event.pull_request.head.repo.full_name': 'JovieInc/Jovie',
  'github.event.pull_request.user.login': 'jovie-bot[bot]',
};
const workflowRun = (name, branch, extra = {}) => ({
  'github.event_name': 'workflow_run',
  'github.repository': 'JovieInc/Jovie',
  'github.event.workflow_run.name': name,
  'github.event.workflow_run.event': 'pull_request',
  'github.event.workflow_run.conclusion': 'success',
  'github.event.workflow_run.head_branch': branch,
  'github.event.workflow_run.head_repository.full_name': 'JovieInc/Jovie',
  'github.event.workflow_run.actor.login': 'jovie-bot[bot]',
  'github.event.workflow_run.pull_requests[0].number': 7,
  ...extra,
});

test('removing an admission-hold label re-arms auto-merge; other label churn starts no runner', () => {
  const workflow = readWorkflow('auto-merge-default.yml');
  assert.ok(workflow.on.pull_request.types.includes('unlabeled'));
  assert.equal(workflow.on.schedule, undefined);
  const condition = workflow.jobs.enable.if;
  const listed = JSON.parse(condition.match(/fromJSON\('([^']+)'\)/)[1]);
  assert.deepEqual(sorted(listed), sorted(ADMISSION_BLOCKING_LABELS));
  for (const label of ADMISSION_BLOCKING_LABELS) {
    const event = {
      ...SAME_REPO_PR,
      'github.event.action': 'unlabeled',
      'github.event.label.name': label,
    };
    assert.equal(evaluateIf(condition, event), true, label);
  }
  for (const label of ['lane-fix-red', 'lane-fix-dequeued', 'ui']) {
    const event = {
      ...SAME_REPO_PR,
      'github.event.action': 'unlabeled',
      'github.event.label.name': label,
    };
    assert.equal(evaluateIf(condition, event), false, label);
  }
  assert.equal(
    evaluateIf(condition, {
      ...SAME_REPO_PR,
      'github.event.action': 'synchronize',
    }),
    true
  );
  assert.equal(
    evaluateIf(condition, {
      ...SAME_REPO_PR,
      'github.event.action': 'unlabeled',
      'github.event.label.name': 'hold',
      'github.event.pull_request.head.repo.full_name': 'fork/Jovie',
    }),
    false
  );
});

test('only Source Validation re-arms enable; size and fork gates wake only the changelog handoff', () => {
  const { jobs } = readWorkflow('auto-merge-default.yml');
  const notes = 'release/daily-changelog-2026-10-12-1-1';
  assert.equal(
    evaluateIf(jobs.enable.if, workflowRun('Source Validation', 'codex/x')),
    true
  );
  for (const name of ['PR Size Guard', 'Fork PR Gate']) {
    assert.equal(
      evaluateIf(jobs.enable.if, workflowRun(name, 'codex/x')),
      false,
      name
    );
    assert.equal(
      evaluateIf(jobs['customer-notes'].if, workflowRun(name, 'codex/x')),
      false
    );
    assert.equal(
      evaluateIf(jobs['customer-notes'].if, workflowRun(name, notes)),
      true
    );
  }
  assert.equal(
    evaluateIf(
      jobs['customer-notes'].if,
      workflowRun('Source Validation', notes)
    ),
    true
  );
  for (const extra of [
    { 'github.event.workflow_run.conclusion': 'failure' },
    { 'github.event.workflow_run.head_repository.full_name': 'fork/Jovie' },
  ])
    assert.equal(
      evaluateIf(
        jobs['customer-notes'].if,
        workflowRun('PR Size Guard', notes, extra)
      ),
      false
    );
  assert.equal(
    evaluateIf(jobs['customer-notes'].if, {
      ...SAME_REPO_PR,
      'github.event.action': 'synchronize',
    }),
    false
  );
  assert.deepEqual(
    readWorkflow('auto-merge-default.yml').on.workflow_run.workflows,
    ['Source Validation', 'PR Size Guard', 'Fork PR Gate']
  );
});

// Runs the real customer-notes step (and the real script) against a fake gh.
test('the customer-notes job readies a green changelog draft on its exact branch', () => {
  const step = readWorkflow('auto-merge-default.yml').jobs[
    'customer-notes'
  ].steps.find(s => s.name.startsWith('Ready the changelog draft'));
  for (const [pending, readied] of [
    [false, true],
    [true, false],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'customer-notes-'));
    try {
      const log = join(dir, 'calls.log');
      const checks = [
        'PR Ready',
        'Migration Guard',
        'Fork PR Gate',
        'PR Size Guard',
      ].map(name => ({ name, bucket: 'pass' }));
      const pr = {
        number: 9,
        isDraft: true,
        isCrossRepository: false,
        baseRefName: 'main',
        headRefName: 'release/daily-changelog-2026-10-12-1-1',
        headRefOid: 'abc',
        files: [{ path: 'CHANGELOG.md' }],
        labels: [],
      };
      writeFileSync(join(dir, 'list.json'), JSON.stringify([pr]));
      writeFileSync(join(dir, 'checks.json'), JSON.stringify(checks));
      writeFileSync(
        join(dir, 'gh'),
        `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${log}"
case "$1 $2" in
  "pr list") cat "${dir}/list.json" ;;
  "pr checks") ${pending ? 'exit 8' : `cat "${dir}/checks.json"`} ;;
  "pr view") echo '{"headRefOid":"abc"}' ;;
esac
`
      );
      chmodSync(join(dir, 'gh'), 0o755);
      const result = spawnSync('bash', ['-c', step.run], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}${delimiter}${process.env.PATH}`,
          GH_TOKEN: 'token',
          GH_REPO: 'JovieInc/Jovie',
          HEAD_BRANCH: pr.headRefName,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      const calls = readFileSync(log, 'utf8');
      assert.match(
        calls,
        /^pr list --repo JovieInc\/Jovie --head release\/daily-changelog-2026-10-12-1-1 --state open/m
      );
      assert.equal(/^pr ready 9 --repo JovieInc\/Jovie$/m.test(calls), readied);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the scheduled stuck report never arms, readies, or queues a PR', () => {
  const workflow = readWorkflow('auto-merge-stuck-report.yml');
  assert.deepEqual(workflow.on.schedule, [{ cron: '29 */6 * * *' }]);
  const job = workflow.jobs.report;
  assert.deepEqual(job.permissions, { contents: 'read' });
  const token = job.steps.find(s => s.id === 'app-token').with;
  assert.equal(token['permission-contents'], 'read');
  assert.equal(token['permission-workflows'], undefined);
  const step = job.steps.find(s => s.name === 'Report stuck PRs');
  for (const [dryRun, expected] of [
    ['false', '--repo JovieInc/Jovie --threshold-hours 6'],
    ['TRUE', '--repo JovieInc/Jovie --threshold-hours 6 --dry-run'],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'stuck-report-'));
    try {
      const log = join(dir, 'node.log');
      writeFileSync(
        join(dir, 'node'),
        `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\n`
      );
      chmodSync(join(dir, 'node'), 0o755);
      const result = spawnSync('bash', ['-c', step.run], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}${delimiter}${process.env.PATH}`,
          GH_REPO: 'JovieInc/Jovie',
          DRY_RUN: dryRun,
          THRESHOLD_HOURS: '6',
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(
        readFileSync(log, 'utf8').trim(),
        `.github/scripts/auto-merge-stuck-triage.js ${expected}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  assert.doesNotMatch(step.run, /enable-missing/);
});
