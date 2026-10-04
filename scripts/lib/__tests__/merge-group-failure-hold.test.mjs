import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  budgets,
  emitBudgetErrors,
  evaluate,
  references,
} from '../../agent-context/check.mjs';
import {
  applyMergeGroupFailure,
  autoMergeWasNotArmed,
  classifyDequeueDenial,
  classifyMergeGroupFailure,
  enqueueWasRejected,
  FAILURE_HOLD_CONTEXT,
  failureReceiptStatus,
  parseMergeQueueBranch,
  retryReleasedDescription,
  retrySpentDescription,
  revisionFailureDisposition,
  sourceHeadForRun,
  supersededByLiveEntry,
} from '../../merge-group-failure-hold.mjs';

const REPOSITORY = 'JovieInc/Jovie';
const SOURCE = 'a'.repeat(40);
const NEW_SOURCE = 'b'.repeat(40);
const BASE = 'c'.repeat(40);
const GROUP = 'd'.repeat(40);
const RUN_URL = 'https://github.com/JovieInc/Jovie/actions/runs/123';
const classify = (conclusion, failedSteps = []) =>
  classifyMergeGroupFailure({ conclusion, failedSteps });
const disposition = statuses =>
  revisionFailureDisposition({ repository: REPOSITORY, statuses });
it('validates trusted failure receipts and never applies them to a different revision', () => {
  const receipt = {
    schema: 'jovie-merge-group-failure-hold/v1',
    repository: REPOSITORY,
    prNumber: 42,
    sourceHeadSha: SOURCE,
    classification: 'deterministic-source',
    failureNumber: 1,
    workflowRunId: 123,
    workflowRunAttempt: 1,
  };
  const scope = { repository: REPOSITORY, prNumber: 42, headSha: SOURCE };
  const convert = value => failureReceiptStatus(JSON.stringify(value), scope);
  const trusted = convert(receipt);
  expect(disposition([trusted]).action).toBe('block');
  expect(trusted.target_url).toBe(RUN_URL);
  expect(failureReceiptStatus('', scope)).toBeNull();
  expect(failureReceiptStatus(undefined, scope)).toBeNull();
  expect(convert({ ...receipt, prNumber: 43 })).toBeNull();
  expect(convert({ ...receipt, sourceHeadSha: NEW_SOURCE })).toBeNull();
  for (const invalid of [
    null,
    {},
    { ...receipt, schema: 'spoof' },
    { ...receipt, repository: 'other/repo' },
    { ...receipt, sourceHeadSha: 'bad' },
    { ...receipt, classification: 'unknown' },
    { ...receipt, prNumber: -1 },
    { ...receipt, failureNumber: 0 },
    { ...receipt, workflowRunId: 0 },
    { ...receipt, workflowRunAttempt: 0 },
  ]) {
    expect(() => convert(invalid)).toThrow();
  }
  expect(() => failureReceiptStatus(null, scope)).toThrow();
  expect(() => failureReceiptStatus('{', scope)).toThrow();
});
const run = {
  id: 123,
  workflow_id: 178737329,
  run_attempt: 1,
  event: 'merge_group',
  status: 'completed',
  conclusion: 'failure',
  path: '.github/workflows/ci.yml',
  head_branch: `gh-readonly-queue/main/pr-42-${BASE}`,
  head_sha: GROUP,
  created_at: '2026-09-30T10:05:00Z',
  html_url: RUN_URL,
  repository: { full_name: REPOSITORY },
  head_repository: { full_name: REPOSITORY },
};
const timeline = [
  { __typename: 'PullRequestCommit', commit: { oid: SOURCE } },
  { __typename: 'AddedToMergeQueueEvent', createdAt: '2026-09-30T10:00:00Z' },
  {
    __typename: 'RemovedFromMergeQueueEvent',
    createdAt: '2026-09-30T10:10:00Z',
    reason: 'failed_checks',
  },
  { __typename: 'PullRequestCommit', commit: { oid: NEW_SOURCE } },
  { __typename: 'AddedToMergeQueueEvent', createdAt: '2026-09-30T10:20:00Z' },
];

const failureInput = {
  repository: REPOSITORY,
  run,
  timeline,
  failedSteps: ['Run structural ci-fast lane'],
  statuses: [],
};

it('passes the actual failure-hold CLI receipt to enrollment without a replicated status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'failure-hold-cli-'));
  try {
    const fixturePath = join(dir, 'fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({ run, timeline, source: SOURCE })
    );
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
let result;
if (args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query='));
  const pr = query.includes('timelineItems')
    ? { timelineItems: { nodes: fixture.timeline, pageInfo: { hasNextPage: false } } }
    : { id: 'PR_42', state: 'OPEN', headRefOid: fixture.source,
        isInMergeQueue: false, mergeQueueEntry: null, autoMergeRequest: null };
  result = { data: { repository: { pullRequest: pr } } };
} else if (args.includes('POST')) result = {};
else if (args[1].includes('/jobs?')) result = { jobs: [
  { steps: [{ name: 'Run structural ci-fast lane', conclusion: 'failure' }] }
] };
else if (args[1].includes('/statuses')) result = [];
else result = fixture.run;
process.stdout.write(JSON.stringify(result));
`,
      { mode: 0o755 }
    );
    const eventPath = join(dir, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        repository: { full_name: REPOSITORY },
        workflow_run: { id: run.id },
      })
    );
    const outputPath = join(dir, 'output');
    const execution = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../merge-group-failure-hold.mjs'),
        '--event-path',
        eventPath,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          HOLD_TEST_FIXTURE: fixturePath,
          GITHUB_OUTPUT: outputPath,
        },
      }
    );
    expect(execution.status, execution.stderr).toBe(0);
    const receipt = JSON.parse(execution.stdout);
    expect(receipt.statusWritten).toBe(true);
    const output = readFileSync(outputPath, 'utf8');
    expect(output).toBe(`failure_receipt=${JSON.stringify(receipt)}\n`);
    const trusted = failureReceiptStatus(
      output.trim().slice('failure_receipt='.length),
      {
        repository: REPOSITORY,
        prNumber: 42,
        headSha: SOURCE,
      }
    );
    expect(disposition([trusted]).action).toBe('block');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each([
  ['annotations', 'base-branch'],
  ['unavailable', 'base-branch'],
  ['missing', 'base-branch'],
  ['raw-log', 'base-branch'],
  ['truncated-log', 'unclassified'],
  ['empty-error-log', 'unclassified'],
  ['mixed-annotations', 'unclassified'],
  ['mixed-log', 'unclassified'],
  ['informational-log', 'unclassified'],
  ['malformed-log', 'unclassified'],
  ['paginated-mixed', 'unclassified'],
  ['incomplete-pages', 'unclassified'],
])(
  'reads complete instruction errors by check identity or job log: %s',
  (mode, classification) => {
    const dir = mkdtempSync(join(tmpdir(), 'failure-hold-annotations-'));
    try {
      const fixturePath = join(dir, 'fixture.json');
      const callsPath = join(dir, 'calls.jsonl');
      const eventPath = join(dir, 'event.json');
      writeFileSync(
        eventPath,
        JSON.stringify({
          repository: { full_name: REPOSITORY },
          workflow_run: { id: run.id },
        })
      );
      writeFileSync(
        join(dir, 'gh'),
        `#!${process.execPath}
const fs = require('node:fs');
const f = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.HOLD_TEST_CALLS, JSON.stringify(args) + '\\n');
let result;
if (args[0] === 'run') {
  if (['annotations', 'mixed-annotations', 'paginated-mixed', 'incomplete-pages'].includes(f.mode)) process.exit(1);
  const prefix = 'instruction-contracts\\tEvaluate repository instruction contracts\\t2026-10-03T05:00:00.000Z ';
  const lines = f.mode === 'informational-log'
    ? ['Observed: CLAUDE.md: 6081 bytes exceeds 6000']
    : [f.mode === 'raw-log' ? '::error::CLAUDE.md: 6081 bytes exceeds 6000' : '##[error]CLAUDE.md: 6081 bytes exceeds 6000'];
  if (f.mode === 'mixed-log') lines.push('::error::docs/agent-context/RESULTS.md: broken link missing.md');
  if (f.mode === 'malformed-log') lines.push('::error file=unknown::unrecognized failure');
  if (f.mode === 'empty-error-log') lines.push('##[error]');
  if (f.mode !== 'truncated-log') lines.push('##[error]Process completed with exit code 1.');
  process.stdout.write(lines.map(line => prefix + line).join('\\n'));
  process.exit(0);
}
if (args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query='));
  const pr = query.includes('timelineItems')
    ? { timelineItems: { nodes: f.timeline, pageInfo: { hasNextPage: false } } }
    : { id: 'PR_42', state: 'OPEN', headRefOid: f.source, isInMergeQueue: false, mergeQueueEntry: null, autoMergeRequest: null };
  result = { data: { repository: { pullRequest: pr } } };
} else if (args.includes('POST')) result = {};
else if (args[1].includes('/jobs?')) result = { jobs: [{
  id: 17,
  check_run_url: f.mode === 'missing' ? undefined : 'https://api.github.com/repos/JovieInc/Jovie/check-runs/29',
  steps: [{ name: 'Evaluate repository instruction contracts', conclusion: 'failure' }]
}] };
else if (args[1].includes('/annotations')) {
  if (!['annotations', 'mixed-annotations', 'paginated-mixed', 'incomplete-pages'].includes(f.mode) || !args[1].includes('/check-runs/29/annotations')) process.exit(1);
  const budget = { annotation_level: 'failure', message: 'CLAUDE.md: 6081 bytes exceeds 6000' };
  const broken = { annotation_level: 'failure', message: 'docs/agent-context/RESULTS.md: broken link missing.md' };
  const page = new URL('https://example.test/' + args[1]).searchParams.get('page');
  if (page === '2' && f.mode === 'incomplete-pages') process.exit(1);
  result = f.mode === 'mixed-annotations' ? [budget, broken]
    : ['paginated-mixed', 'incomplete-pages'].includes(f.mode)
      ? page === '2' ? [broken] : Array(100).fill(budget)
      : [budget, { annotation_level: 'failure', message: 'Process completed with exit code 1.' }];
} else if (args[1].includes('/compare/')) result = { files: [{ filename: 'README.md' }] };
else if (args[1].endsWith('/commits/main')) result = { sha: f.main };
else if (args[1].includes('/statuses')) result = [];
else result = f.run;
process.stdout.write(JSON.stringify(result));
`,
        { mode: 0o755 }
      );
      {
        writeFileSync(
          fixturePath,
          JSON.stringify({ run, timeline, source: SOURCE, main: BASE, mode })
        );
        writeFileSync(callsPath, '');
        const execution = spawnSync(
          process.execPath,
          [
            resolve(import.meta.dirname, '../../merge-group-failure-hold.mjs'),
            '--event-path',
            eventPath,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${dir}:${process.env.PATH}`,
              HOLD_TEST_FIXTURE: fixturePath,
              HOLD_TEST_CALLS: callsPath,
            },
          }
        );
        expect(execution.status, execution.stderr).toBe(0);
        expect(JSON.parse(execution.stdout).classification, mode).toBe(
          classification
        );
        const calls = readFileSync(callsPath, 'utf8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line));
        expect(
          calls.some(args => String(args[1]).includes('/check-runs/17/'))
        ).toBe(false);
        expect(
          calls.some(args => String(args[1]).includes('/check-runs/29/'))
        ).toBe(mode !== 'missing');
        expect(
          calls.some(args => args[0] === 'run' && args.includes('17'))
        ).toBe(
          [
            'unavailable',
            'missing',
            'raw-log',
            'truncated-log',
            'empty-error-log',
            'mixed-log',
            'informational-log',
            'malformed-log',
            'incomplete-pages',
          ].includes(mode)
        );
        if (['paginated-mixed', 'incomplete-pages'].includes(mode)) {
          expect(
            calls.some(args =>
              String(args[1]).endsWith(
                '/check-runs/29/annotations?per_page=100&page=2'
              )
            )
          ).toBe(true);
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
);

it('completes the hold CLI when gh denies dequeuePullRequest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'failure-hold-deny-'));
  try {
    const fixturePath = join(dir, 'fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({ run, timeline, source: SOURCE })
    );
    writeFileSync(
      join(dir, 'gh'),
      `#!${process.execPath}
const args = process.argv.slice(2);
const fs = require('node:fs');
const fixture = JSON.parse(fs.readFileSync(process.env.HOLD_TEST_FIXTURE, 'utf8'));
if (args[1] === 'graphql') {
  const query = args.find(arg => arg.startsWith('query=')) || '';
  if (query.includes('dequeuePullRequest')) {
    process.stderr.write('gh: Resource not accessible by integration\\n');
    process.exit(1);
  }
  if (query.includes('disablePullRequestAutoMerge')) {
    process.stderr.write("gh: Can't disable auto-merge for this pull request.\\n");
    process.exit(1);
  }
  const pr = query.includes('timelineItems')
    ? { timelineItems: { nodes: fixture.timeline, pageInfo: { hasNextPage: false } } }
    : { id: 'PR_42', state: 'OPEN', headRefOid: fixture.source,
        isInMergeQueue: true, mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: fixture.run.head_sha } }, autoMergeRequest: null };
  process.stdout.write(JSON.stringify({ data: { repository: { pullRequest: pr } } }));
} else if (args.includes('POST')) {
  process.stdout.write('{}');
} else if (args[1].includes('/jobs?')) {
  process.stdout.write(JSON.stringify({ jobs: [
    { steps: [{ name: 'Run structural ci-fast lane', conclusion: 'failure' }] }
  ] }));
} else if (args[1].includes('/statuses')) {
  process.stdout.write('[]');
} else {
  process.stdout.write(JSON.stringify(fixture.run));
}
`,
      { mode: 0o755 }
    );
    const eventPath = join(dir, 'event.json');
    writeFileSync(
      eventPath,
      JSON.stringify({
        repository: { full_name: REPOSITORY },
        workflow_run: { id: run.id },
      })
    );
    const outputPath = join(dir, 'output');
    const execution = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../../merge-group-failure-hold.mjs'),
        '--event-path',
        eventPath,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          HOLD_TEST_FIXTURE: fixturePath,
          GITHUB_OUTPUT: outputPath,
        },
      }
    );
    expect(execution.status, execution.stderr).toBe(0);
    expect(execution.stderr).toContain(
      'Resource not accessible by integration'
    );
    const receipt = JSON.parse(execution.stdout);
    expect(receipt).toMatchObject({
      statusWritten: true,
      dequeued: false,
      dequeueOutcome: 'inaccessible',
      autoMergeDisabled: false,
    });
    expect(readFileSync(outputPath, 'utf8')).toBe(
      `failure_receipt=${JSON.stringify(receipt)}\n`
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const status = ({
  classification = 'deterministic-source',
  number = 1,
  runId = 123,
  attempt = 1,
  context = FAILURE_HOLD_CONTEXT,
  description = `class=${classification};n=${number};run=${runId};try=${attempt}`,
} = {}) => ({
  context,
  state: 'success',
  description,
  creator: { type: 'Bot', login: 'jovie-bot[bot]' },
  target_url: `https://github.com/${REPOSITORY}/actions/runs/${runId}`,
});

describe('merge-group source revision mapping', () => {
  it('maps the exact front PR and source head even after a later push', () => {
    expect(parseMergeQueueBranch(run.head_branch)).toEqual({
      prNumber: 42,
      baseSha: BASE,
    });
    expect(sourceHeadForRun(timeline, run.created_at)).toBe(SOURCE);
    expect(sourceHeadForRun(timeline, '2026-09-30T10:25:00Z')).toBe(NEW_SOURCE);
  });

  it('fails closed when no admitted source revision is provable', () => {
    expect(() => sourceHeadForRun([], run.created_at)).toThrow(
      /no queue admission/
    );
    expect(parseMergeQueueBranch('gh-readonly-queue/main/pr-42-short')).toBe(
      null
    );
  });

  it('rejects a similarly shaped run from any workflow other than CI', async () => {
    await expect(
      applyMergeGroupFailure(
        {
          ...failureInput,
          run: { ...run, workflow_id: 1 },
        },
        {
          writeStatus: vi.fn(),
          readPullRequest: vi.fn(),
          dequeuePullRequest: vi.fn(),
          disableAutoMerge: vi.fn(),
        }
      )
    ).rejects.toThrow(/terminal merge-group CI failure/);
  });
});

describe('failure classification and revision-scoped suppression', () => {
  it('classifies deterministic source checks separately from infrastructure', () => {
    expect(classify('failure', ['Run structural ci-fast lane'])).toBe(
      'deterministic-source'
    );
    expect(classify('failure', ['Run unit tests'])).toBe('retryable-product');
    expect(classify('startup_failure')).toBe('transient-infrastructure');
  });

  it('classifies an over-cap base separately from a PR that grew the capped file', () => {
    const step = ['Evaluate repository instruction contracts'];
    const text = 'CLAUDE.md: 6081 bytes exceeds 6000';
    expect(classify('failure', step)).toBe('unclassified');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: step,
        annotationText: text,
        changedFiles: ['apps/web/page.tsx'],
      })
    ).toBe('base-branch');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: [
          ...step,
          'Join exact lane results',
          'Evaluate combined-head checks',
        ],
        annotationText: text,
        changedFiles: ['apps/web/page.tsx'],
      })
    ).toBe('base-branch');
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: step,
        annotationText: text,
        changedFiles: ['CLAUDE.md'],
      })
    ).toBe('deterministic-source');
  });

  it('requires exclusively valid capped-file budget errors, including actual evaluator diagnostics', () => {
    const dir = mkdtempSync(join(tmpdir(), 'instruction-errors-'));
    try {
      for (const file of [...Object.keys(budgets), ...references]) {
        mkdirSync(dirname(join(dir, file)), { recursive: true });
        writeFileSync(join(dir, file), '# Valid\n');
      }
      symlinkSync('CLAUDE.md', join(dir, 'AGENTS.md'));
      writeFileSync(join(dir, 'CLAUDE.md'), 'x'.repeat(6081));
      const decide = annotationText =>
        classifyMergeGroupFailure({
          conclusion: 'failure',
          failedSteps: ['Evaluate repository instruction contracts'],
          annotationText,
          changedFiles: ['docs/agent-context/RESULTS.md'],
        });
      const pure = evaluate(dir);
      expect(pure.errors).toEqual(['CLAUDE.md: 6081 bytes exceeds 6000']);
      expect(decide(pure.errors.join('\n'))).toBe('base-branch');
      writeFileSync(
        join(dir, 'docs/agent-context/RESULTS.md'),
        '[missing](missing.md)'
      );
      const mixed = evaluate(dir);
      expect(mixed.errors).toEqual([
        ...pure.errors,
        'docs/agent-context/RESULTS.md: broken link missing.md',
      ]);
      const emitted = [];
      emitBudgetErrors(mixed.errors, error => emitted.push(error));
      expect(emitted).toEqual(mixed.errors.map(error => `::error::${error}`));
      for (const text of [
        mixed.errors.join('\n'),
        'CLAUDE.md: 6000 bytes exceeds 6000',
        'CLAUDE.md: 5 bytes exceeds 6000',
        'CLAUDE.md: 9007199254740992 bytes exceeds 6000',
        'other.md: 6081 bytes exceeds 6000',
        'CLAUDE.md: 6081 bytes exceeds 0',
        'Info: CLAUDE.md: 6081 bytes exceeds 6000',
        'CLAUDE.md: 6081 bytes exceeds 6000\nmissing: DESIGN.md',
        'CLAUDE.md: 6081 bytes exceeds 6000\nProcess completed with exit code 2.',
      ])
        expect(decide(text), text).toBe('unclassified');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('requeues a base-branch hold only after main moves', () => {
    const recorded = 'e'.repeat(40);
    const moved = 'f'.repeat(40);
    const baseHold = status({
      description: `class=base-branch;n=2;run=123;try=1;main=${recorded}`,
    });
    expect(disposition([baseHold])).toMatchObject({
      action: 'block',
      reason: 'base-branch-failure',
    });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [baseHold],
        currentMainSha: recorded,
      })
    ).toMatchObject({ action: 'block', reason: 'base-branch-failure' });
    expect(
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses: [baseHold],
        currentMainSha: moved,
      })
    ).toMatchObject({ action: 'retry-once', reason: 'base-branch-resolved' });
  });

  it('reserves a moved-base retry once and releases only a rejected enqueue', () => {
    const baseHold = status({
      description: `class=base-branch;n=2;run=123;try=1;main=${BASE}`,
    });
    const spent = status({
      context: 'jovie-queue-failure-retry/v1',
      description: 'spent:run=123;try=1',
    });
    const released = { ...spent, description: 'released:run=123;try=1' };
    const decide = (statuses, currentMainSha = GROUP) =>
      revisionFailureDisposition({
        repository: REPOSITORY,
        statuses,
        currentMainSha,
      });
    expect(decide([spent, baseHold])).toMatchObject({
      action: 'block',
      reason: 'revision-retry-spent',
    });
    expect(decide([released, spent, baseHold])).toMatchObject({
      action: 'retry-once',
      reason: 'base-branch-resolved',
    });
    expect(decide([spent, released, baseHold])).toMatchObject({
      action: 'block',
      reason: 'revision-retry-spent',
    });
    for (const main of ['', 'invalid', BASE]) {
      expect(decide([baseHold], main)).toMatchObject({
        action: 'block',
        reason: 'base-branch-failure',
      });
    }
  });

  it('does not classify other unexplained failures as a base budget failure', () => {
    for (const otherFailure of [
      'Run structural pytest shards',
      'Enforce authed route initial JS budgets',
    ]) {
      expect(
        classifyMergeGroupFailure({
          conclusion: 'failure',
          failedSteps: [
            'Evaluate repository instruction contracts',
            otherFailure,
          ],
          annotationText: 'CLAUDE.md: 6081 bytes exceeds 6000',
          changedFiles: ['scripts/own-failing-check.mjs'],
        })
      ).toBe('unclassified');
    }
  });

  it('releases only an explicitly rejected enqueue, preserving ambiguous outcomes', () => {
    const rejected = {
      data: { enqueuePullRequest: null },
      errors: [{ type: 'UNPROCESSABLE', path: ['enqueuePullRequest'] }],
    };
    expect(enqueueWasRejected(rejected)).toBe(true);
    for (const error of [
      new Error('socket timeout'),
      {},
      {
        ...rejected,
        data: { enqueuePullRequest: { mergeQueueEntry: { position: 1 } } },
      },
      {
        ...rejected,
        errors: [{ type: 'INTERNAL', path: ['enqueuePullRequest'] }],
      },
      {
        ...rejected,
        errors: [{ type: 'UNPROCESSABLE', path: ['anotherMutation'] }],
      },
      { ...rejected, errors: [] },
    ])
      expect(enqueueWasRejected(error)).toBe(false);
  });

  it('newest trusted release restores the unused retry; a later reservation blocks it', () => {
    const first = status({ classification: 'transient-infrastructure' });
    const spent = status({
      context: 'jovie-queue-failure-retry/v1',
      description: retrySpentDescription({ runId: 123, runAttempt: 1 }),
    });
    const released = {
      ...spent,
      description: retryReleasedDescription({ runId: 123, runAttempt: 1 }),
    };
    expect(disposition([released, spent, first])).toMatchObject({
      action: 'retry-once',
    });
    expect(disposition([spent, released, first])).toMatchObject({
      action: 'block',
    });
    expect(
      disposition([
        { ...released, creator: { login: 'random', type: 'Bot' } },
        spent,
        first,
      ])
    ).toMatchObject({ action: 'block' });
    expect(
      disposition([
        released,
        spent,
        status({ classification: 'deterministic-source' }),
      ])
    ).toMatchObject({
      action: 'block',
      reason: 'deterministic-source-failure',
    });
    expect(
      disposition([
        released,
        spent,
        status({ classification: 'transient-infrastructure', number: 2 }),
      ])
    ).toMatchObject({ action: 'block', reason: 'revision-retry-exhausted' });
  });

  it('blocks the unchanged deterministic head while a new head has no hold', () => {
    expect(disposition([status()])).toMatchObject({
      action: 'block',
      reason: 'deterministic-source-failure',
    });
    expect(disposition([])).toMatchObject({ action: 'allow' });
  });

  it('allows one non-deterministic retry, then blocks the same revision', () => {
    const first = status({ classification: 'transient-infrastructure' });
    expect(disposition([first])).toMatchObject({ action: 'retry-once' });
    const spent = status({
      context: 'jovie-queue-failure-retry/v1',
      description: retrySpentDescription({ runId: 123, runAttempt: 1 }),
    });
    expect(disposition([first, spent])).toMatchObject({
      action: 'block',
      reason: 'revision-retry-spent',
    });
    expect(
      disposition([
        first,
        status({
          classification: 'transient-infrastructure',
          number: 2,
          runId: 124,
        }),
      ])
    ).toMatchObject({ action: 'block', reason: 'revision-retry-exhausted' });
  });
});

describe('terminal failure hold application', () => {
  // Replays run 37167458268 (2026-10-04 01:15Z): admission ran out of the
  // installation quota and PR Ready reported it. No source revision failed.
  const ADMISSION_QUOTA_STEPS = [
    'Require live queue membership and external admission checks',
    'Evaluate combined-head checks',
  ];
  const ADMISSION_QUOTA_TEXT = [
    'Process completed with exit code 1.',
    'live merge queue GraphQL returned errors: API rate limit already exceeded for site ID installation.',
  ].join('\n');

  it('classifies an admission quota failure as transient admission, never a source failure', () => {
    expect(
      classifyMergeGroupFailure({
        conclusion: 'failure',
        failedSteps: ADMISSION_QUOTA_STEPS,
        admissionText: ADMISSION_QUOTA_TEXT,
      })
    ).toBe('transient-admission');
    for (const admissionText of [
      'Process completed with exit code 1.\nGitHub API 503 for /graphql: Service Unavailable',
      'GitHub API request failed for /graphql: The operation was aborted due to timeout',
      'GitHub API 403 for /repos/x/y/commits/z/check-runs: API rate limit exceeded for installation',
    ]) {
      expect(
        classifyMergeGroupFailure({
          conclusion: 'failure',
          failedSteps: ADMISSION_QUOTA_STEPS,
          admissionText,
        })
      ).toBe('transient-admission');
    }
    // A real admission denial, missing evidence, or another failed step still
    // counts against the revision.
    for (const input of [
      {
        failedSteps: ADMISSION_QUOTA_STEPS,
        admissionText:
          'Process completed with exit code 1.\nPR #42 is not a live member of this merge group',
      },
      { failedSteps: ADMISSION_QUOTA_STEPS, admissionText: '' },
      {
        failedSteps: [...ADMISSION_QUOTA_STEPS, 'Run unit tests'],
        admissionText: ADMISSION_QUOTA_TEXT,
      },
      {
        failedSteps: ['Evaluate combined-head checks'],
        admissionText: ADMISSION_QUOTA_TEXT,
      },
    ]) {
      expect(
        classifyMergeGroupFailure({ conclusion: 'failure', ...input })
      ).not.toBe('transient-admission');
    }
  });

  it('spends no retry and keeps merge intent for an admission quota failure', async () => {
    const writeStatus = vi.fn();
    const dequeuePullRequest = vi.fn();
    const disableAutoMerge = vi.fn();
    const readPullRequest = vi.fn(async () => ({
      id: 'PR_42',
      state: 'OPEN',
      headRefOid: SOURCE,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: GROUP } },
      autoMergeRequest: { enabledAt: '2026-10-04T01:00:00Z' },
    }));
    const result = await applyMergeGroupFailure(
      {
        ...failureInput,
        failedSteps: ADMISSION_QUOTA_STEPS,
        admissionText: ADMISSION_QUOTA_TEXT,
      },
      { writeStatus, readPullRequest, dequeuePullRequest, disableAutoMerge }
    );
    expect(result).toMatchObject({
      prNumber: 42,
      classification: 'transient-admission',
      skipped: true,
      statusWritten: false,
      dequeued: false,
      autoMergeDisabled: false,
    });
    expect(writeStatus).not.toHaveBeenCalled();
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(disableAutoMerge).not.toHaveBeenCalled();
  });

  it('persists before dequeueing and disabling the exact unchanged head', async () => {
    let state = {
      id: 'PR_42',
      state: 'OPEN',
      headRefOid: SOURCE,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: GROUP } },
      autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
    };
    const order = [];
    const writeStatus = vi.fn(async receipt => {
      order.push('status');
      expect(receipt.sha).toBe(SOURCE);
      expect(receipt.description).toContain('class=deterministic-source');
    });
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus,
      readPullRequest: vi.fn(async () => structuredClone(state)),
      dequeuePullRequest: vi.fn(async () => {
        order.push('dequeue');
        state = { ...state, isInMergeQueue: false, mergeQueueEntry: null };
      }),
      disableAutoMerge: vi.fn(async () => {
        order.push('disable');
        state = { ...state, autoMergeRequest: null };
      }),
    });

    expect(order).toEqual(['status', 'dequeue', 'disable']);
    expect(result).toMatchObject({
      prNumber: 42,
      sourceHeadSha: SOURCE,
      classification: 'deterministic-source',
      retryDisposition: 'blocked-until-new-source-head',
      dequeued: true,
      autoMergeDisabled: true,
    });
  });

  it('records a base-branch hold that can requeue after main moves', async () => {
    const main = 'e'.repeat(40);
    const writeStatus = vi.fn();
    const result = await applyMergeGroupFailure(
      {
        ...failureInput,
        failedSteps: ['Evaluate repository instruction contracts'],
        annotationText: 'CLAUDE.md: 6081 bytes exceeds 6000',
        changedFiles: ['README.md'],
        mainSha: main,
      },
      {
        writeStatus,
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: false,
          mergeQueueEntry: null,
          autoMergeRequest: null,
        })),
        dequeuePullRequest: vi.fn(),
        disableAutoMerge: vi.fn(),
      }
    );
    expect(result).toMatchObject({
      classification: 'base-branch',
      retryDisposition: 'requeue-after-base-moves',
      mainSha: main,
    });
    expect(writeStatus.mock.calls[0][0].description).toBe(
      `class=base-branch;n=1;run=123;try=1;main=${main}`
    );
  });

  it('records the old revision but never mutates an already-new source head', async () => {
    const dequeuePullRequest = vi.fn();
    const disableAutoMerge = vi.fn();
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus: vi.fn(),
      readPullRequest: vi.fn(async () => ({
        id: 'PR_42',
        state: 'OPEN',
        headRefOid: NEW_SOURCE,
        isInMergeQueue: false,
        mergeQueueEntry: null,
        autoMergeRequest: { enabledAt: '2026-09-30T10:30:00Z' },
      })),
      dequeuePullRequest,
      disableAutoMerge,
    });

    expect(result).toMatchObject({
      sourceHeadSha: SOURCE,
      currentHeadSha: NEW_SOURCE,
      exactHeadStillCurrent: false,
    });
    expect(dequeuePullRequest).not.toHaveBeenCalled();
    expect(disableAutoMerge).not.toHaveBeenCalled();
  });

  it('ignores a superseded group failure while the exact source is still queued', async () => {
    const LIVE_GROUP = 'f'.repeat(40);
    for (const mergeQueueEntry of [
      { id: 'MQE_42', headCommit: { oid: LIVE_GROUP } },
      { id: 'MQE_42', headCommit: null },
    ]) {
      const writeStatus = vi.fn();
      const dequeuePullRequest = vi.fn();
      const disableAutoMerge = vi.fn();
      const result = await applyMergeGroupFailure(failureInput, {
        writeStatus,
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: true,
          mergeQueueEntry,
          autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
        })),
        dequeuePullRequest,
        disableAutoMerge,
      });
      expect(result).toMatchObject({
        superseded: true,
        mergeGroupHeadSha: GROUP,
        liveMergeGroupHeadSha: mergeQueueEntry.headCommit?.oid ?? null,
        statusWritten: false,
        dequeued: false,
        autoMergeDisabled: false,
      });
      // No retry is spent and the live entry keeps its place in the queue.
      expect(writeStatus).not.toHaveBeenCalled();
      expect(dequeuePullRequest).not.toHaveBeenCalled();
      expect(disableAutoMerge).not.toHaveBeenCalled();
    }
  });

  it('only treats a live queued exact source as superseded', () => {
    const queued = {
      state: 'OPEN',
      headRefOid: SOURCE,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: GROUP } },
    };
    expect(supersededByLiveEntry(queued, SOURCE, GROUP)).toBe(false);
    expect(supersededByLiveEntry(queued, SOURCE, 'f'.repeat(40))).toBe(true);
    expect(
      supersededByLiveEntry(
        { ...queued, isInMergeQueue: false, mergeQueueEntry: null },
        SOURCE,
        'f'.repeat(40)
      )
    ).toBe(false);
    expect(supersededByLiveEntry(queued, NEW_SOURCE, 'f'.repeat(40))).toBe(
      false
    );
    expect(
      supersededByLiveEntry(
        { ...queued, state: 'CLOSED' },
        SOURCE,
        'f'.repeat(40)
      )
    ).toBe(false);
  });

  it('classifies only the integration denial and an already-removed queue', () => {
    const denied = Object.assign(new Error('Command failed: gh api graphql'), {
      stderr: 'gh: Resource not accessible by integration\n',
    });
    expect(classifyDequeueDenial(denied)).toBe('inaccessible');
    expect(
      classifyDequeueDenial(
        new Error('The pull request is not in the merge queue')
      )
    ).toBe('not-in-queue');
    expect(classifyDequeueDenial(new Error('not in queue'))).toBe(
      'not-in-queue'
    );
    expect(classifyDequeueDenial(new Error('HTTP 502'))).toBeNull();
    expect(classifyDequeueDenial(new Error('socket hang up'))).toBeNull();
  });

  it('persists the hold when dequeue is denied and still disables auto-merge', async () => {
    let state = {
      id: 'PR_42',
      state: 'OPEN',
      headRefOid: SOURCE,
      isInMergeQueue: true,
      mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: GROUP } },
      autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
    };
    const order = [];
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus: vi.fn(async () => {
        order.push('status');
      }),
      readPullRequest: vi.fn(async () => structuredClone(state)),
      dequeuePullRequest: vi.fn(async () => {
        order.push('dequeue');
        const error = Object.assign(
          new Error('Command failed: gh api graphql'),
          { stderr: 'gh: Resource not accessible by integration\n' }
        );
        throw error;
      }),
      disableAutoMerge: vi.fn(async () => {
        order.push('disable');
        state = { ...state, autoMergeRequest: null };
      }),
    });

    expect(order).toEqual(['status', 'dequeue', 'disable']);
    expect(result).toMatchObject({
      statusWritten: true,
      dequeued: false,
      dequeueOutcome: 'inaccessible',
      autoMergeDisabled: true,
      exactHeadStillCurrent: true,
    });
  });

  it('treats an already-removed pull request as a logged non-fatal dequeue', async () => {
    let reads = 0;
    const disableAutoMerge = vi.fn(async () => {
      throw new Error("Can't disable auto-merge for this pull request.");
    });
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus: vi.fn(),
      readPullRequest: vi.fn(async () => {
        reads += 1;
        const queued = reads < 4;
        return {
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: queued,
          mergeQueueEntry: queued
            ? { id: 'MQE_42', headCommit: { oid: GROUP } }
            : null,
          autoMergeRequest: null,
        };
      }),
      dequeuePullRequest: vi.fn(async () => {
        throw new Error('The pull request is not in the merge queue');
      }),
      disableAutoMerge,
    });

    expect(disableAutoMerge).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      dequeued: false,
      dequeueOutcome: 'not-in-queue',
      autoMergeDisabled: false,
    });
  });

  it('still fails the hold when dequeue hits a genuine error', async () => {
    const writeStatus = vi.fn();
    await expect(
      applyMergeGroupFailure(failureInput, {
        writeStatus,
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: true,
          mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: GROUP } },
          autoMergeRequest: null,
        })),
        dequeuePullRequest: vi.fn(async () => {
          throw new Error('HTTP 502');
        }),
        disableAutoMerge: vi.fn(),
      })
    ).rejects.toThrow(/HTTP 502/);
    expect(writeStatus).toHaveBeenCalledOnce();
  });

  it('still fails when auto-merge remains after a denied dequeue', async () => {
    await expect(
      applyMergeGroupFailure(failureInput, {
        writeStatus: vi.fn(),
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: true,
          mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: GROUP } },
          autoMergeRequest: { enabledAt: '2026-09-30T10:00:00Z' },
        })),
        dequeuePullRequest: vi.fn(async () => {
          throw new Error('gh: Resource not accessible by integration');
        }),
        disableAutoMerge: vi.fn(),
      })
    ).rejects.toThrow(/native queue intent/);
  });
});

describe('poison re-enqueue loop (JOV-7708, #20354)', () => {
  // Replays #20354 on 2026-10-03: one unchanged head, an armed auto-merge
  // that GitHub hides (autoMergeRequest null) while queued and just after the
  // dequeue, and a queue that re-adds an armed CLEAN PR seconds later. Before
  // the fix the hold never disabled auto-merge, so the head re-entered the
  // queue 13 times and failed 8 holds.
  const replay = async ({ failures }) => {
    let armed = true;
    let queued = true;
    let enqueues = 1;
    const statuses = [];
    for (let attempt = 1; attempt <= failures && queued; attempt += 1) {
      const runId = 1000 + attempt;
      const receipt = await applyMergeGroupFailure(
        {
          ...failureInput,
          failedSteps: ['Run structural ci-fast lane'],
          run: {
            ...failureInput.run,
            id: runId,
            html_url: `https://github.com/${REPOSITORY}/actions/runs/${runId}`,
          },
          statuses: structuredClone(statuses),
        },
        {
          writeStatus: async written =>
            statuses.unshift({
              context: written.context,
              state: written.state,
              description: written.description,
              creator: { type: 'Bot', login: 'jovie-bot[bot]' },
              target_url: written.targetUrl,
            }),
          readPullRequest: async () => ({
            id: 'PR_20354',
            state: 'OPEN',
            headRefOid: SOURCE,
            isInMergeQueue: queued,
            // The failed group is the live entry: not a superseded run.
            mergeQueueEntry: queued
              ? { id: 'MQE', headCommit: { oid: GROUP } }
              : null,
            autoMergeRequest: null, // GitHub's lagging read
          }),
          dequeuePullRequest: async () => {
            queued = false;
          },
          disableAutoMerge: async () => {
            if (!armed) {
              throw new Error(
                "Can't disable auto-merge for this pull request."
              );
            }
            armed = false;
          },
        }
      );
      expect(receipt.sourceHeadSha).toBe(SOURCE);
      // GitHub re-adds an armed, CLEAN pull request on its own.
      if (armed) {
        queued = true;
        enqueues += 1;
      }
    }
    return { enqueues, armed, statuses };
  };

  it('disables the hidden auto-merge so the same head never re-enters on its own', async () => {
    const { enqueues, armed, statuses } = await replay({ failures: 13 });
    expect(armed).toBe(false);
    expect(enqueues).toBe(1);
    // One failure, one hold: the loop never reaches a second merge group.
    expect(statuses).toHaveLength(1);
  });

  it('never disables auto-merge for a superseded run, even when the read hides it', async () => {
    const disableAutoMerge = vi.fn();
    const result = await applyMergeGroupFailure(failureInput, {
      writeStatus: vi.fn(),
      readPullRequest: vi.fn(async () => ({
        id: 'PR_42',
        state: 'OPEN',
        headRefOid: SOURCE,
        isInMergeQueue: true,
        mergeQueueEntry: { id: 'MQE_42', headCommit: { oid: 'f'.repeat(40) } },
        autoMergeRequest: null,
      })),
      dequeuePullRequest: vi.fn(),
      disableAutoMerge,
    });
    expect(result).toMatchObject({
      superseded: true,
      autoMergeDisabled: false,
    });
    expect(disableAutoMerge).not.toHaveBeenCalled();
  });

  it('still fails closed when disabling auto-merge hits a genuine error', async () => {
    await expect(
      applyMergeGroupFailure(failureInput, {
        writeStatus: vi.fn(),
        readPullRequest: vi.fn(async () => ({
          id: 'PR_42',
          state: 'OPEN',
          headRefOid: SOURCE,
          isInMergeQueue: false,
          mergeQueueEntry: null,
          autoMergeRequest: null,
        })),
        dequeuePullRequest: vi.fn(),
        disableAutoMerge: vi.fn(async () => {
          throw new Error('Something went wrong while executing your query.');
        }),
      })
    ).rejects.toThrow('Something went wrong');
  });

  it('recognizes only the not-armed answer as benign', () => {
    expect(
      autoMergeWasNotArmed(
        new Error("Can't disable auto-merge for this pull request.")
      )
    ).toBe(true);
    expect(autoMergeWasNotArmed(new Error('Bad credentials'))).toBe(false);
  });
});
