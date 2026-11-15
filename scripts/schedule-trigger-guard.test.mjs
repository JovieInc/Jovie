import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ALLOWLIST_PATH,
  ALLOWLIST_SCHEMA,
  collectAddedLines,
  evaluateViolations,
  main,
} from './schedule-trigger-guard.mjs';

const addedMap = entries => new Map(entries);

const workflowCron = [
  'on:',
  '  schedule:',
  "    - cron: '*/5 * * * *'",
  'jobs:',
  '  j:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo hi',
].join('\n');

test('a newly added cron trigger fails the guard', () => {
  const errors = evaluateViolations({
    added: addedMap([
      ['.github/workflows/new-clock.yml', workflowCron.split('\n')],
    ]),
    allowlist: [],
    registryIds: new Set(['github:jovie:production-continuity']),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /new-clock\.yml: adds a schedule/);
});

test('a modified workflow that only removes its cron passes', () => {
  const errors = evaluateViolations({
    added: addedMap([
      ['.github/workflows/old-clock.yml', ['on: push', 'jobs:', '  j:']],
    ]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(errors.length, 0);
});

test('an allowlisted schedule with a live registry id passes; a dead id fails', () => {
  const allowlist = [
    {
      file: '.github/workflows/new-clock.yml',
      justification:
        'Inherently time-based: expiry probe with no event source.',
      registryId: 'github:jovie:production-continuity',
    },
  ];
  const live = evaluateViolations({
    added: addedMap([
      ['.github/workflows/new-clock.yml', workflowCron.split('\n')],
    ]),
    allowlist,
    registryIds: new Set(['github:jovie:production-continuity']),
  });
  assert.equal(live.length, 0);
  const dead = evaluateViolations({
    added: addedMap([
      ['.github/workflows/new-clock.yml', workflowCron.split('\n')],
    ]),
    allowlist,
    registryIds: new Set(),
  });
  assert.equal(dead.length, 1);
  assert.match(dead[0], /not a live canon/);
});

test('an allowlist entry missing a field is itself a violation', () => {
  const errors = evaluateViolations({
    added: new Map(),
    allowlist: [{ file: '.github/workflows/x.yml' }],
    registryIds: new Set(),
  });
  assert.equal(errors.length, 1);
  assert.match(
    errors[0],
    /every entry needs file, justification and registryId/
  );
});

test('a malformed allowlist fails closed', () => {
  const errors = evaluateViolations({
    added: new Map(),
    allowlist: {
      invalid: 'canon/automation-schedule-allowlist.json is not valid JSON',
    },
    registryIds: new Set(),
  });
  assert.equal(errors.length, 1);
});

test('a script whose added lines poll the GitHub API fails; event-shaped reads pass', () => {
  const polling = [
    'async function waitForChecks() {',
    '  while (true) {',
    '    const r = await fetch("https://api.github.com/repos/x/y");',
    '    if (r.status === 200) return r;',
    '    await sleep(30_000);',
    '  }',
    '}',
  ].map(line => line.trimEnd());
  const flagged = evaluateViolations({
    added: addedMap([['scripts/wait-for-checks.mjs', polling]]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(flagged.length, 1);
  assert.match(flagged[0], /polling/);

  const eventShaped = [
    'export function onWorkflowRunCompletion(event) {',
    '  const pr = event.workflow_run.pull_requests[0];',
    '  return enqueue(pr.number);',
    '}',
  ];
  const clean = evaluateViolations({
    added: addedMap([['scripts/enroll-on-wake.mjs', eventShaped]]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(clean.length, 0);
});

test('a loop that does not touch the GitHub API is not polling', () => {
  const errors = evaluateViolations({
    added: addedMap([
      [
        'scripts/retry-upload.sh',
        [
          'while [ -n "$queue" ]; do',
          '  upload_one "$queue"',
          '  queue="$(tail -n +2 <<<"$queue")"',
          'done',
        ],
      ],
    ]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(errors.length, 0);
});

test('comment lines and test files never count as polling evidence', () => {
  const commentsOnly = evaluateViolations({
    added: addedMap([
      [
        'scripts/poller.mjs',
        [
          '// wait until gh api answers before fetching api.github.com again',
          'export const done = true;',
        ],
      ],
    ]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(commentsOnly.length, 0);
  const testFile = evaluateViolations({
    added: addedMap([
      [
        'scripts/poller.test.mjs',
        ['while (true) {', '  await gh.api("repos/x/y")', '}'],
      ],
    ]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(testFile.length, 0);
});

test('collectAddedLines only returns + lines of the changed files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'schedule-guard-'));
  try {
    const { execFileSync } = await import('node:child_process');
    const exec = (cmd, args) =>
      execFileSync(cmd, args, { cwd: root, encoding: 'utf8' });
    const run = (file, body) => writeFileSync(join(root, file), body);
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    run('README.md', 'base\n');
    exec('git', ['init', '-q']);
    exec('git', ['config', 'user.email', 't@jov.ie']);
    exec('git', ['config', 'user.name', 'T']);
    exec('git', ['add', '-A']);
    exec('git', ['commit', '-qm', 'base']);
    run('README.md', 'head\n');
    run('.github/workflows/clock.yml', workflowCron);
    exec('git', ['add', '-A']);
    exec('git', ['commit', '-qm', 'head']);
    const base = exec('git', ['rev-parse', 'HEAD~1']).trim();
    const added = collectAddedLines(root, base);
    assert.deepEqual(
      [...added.get('.github/workflows/clock.yml')],
      workflowCron.split('\n')
    );
    assert.deepEqual(added.get('README.md'), ['head']);

    mkdirSync(join(root, 'canon'), { recursive: true });
    writeFileSync(
      join(root, ALLOWLIST_PATH),
      `${JSON.stringify(
        {
          schema: ALLOWLIST_SCHEMA,
          entries: [
            {
              file: '.github/workflows/clock.yml',
              justification: 'test entry',
              registryId: 'github:jovie:production-continuity',
            },
          ],
        },
        null,
        2
      )}\n`
    );
    writeFileSync(
      join(root, 'canon/automation-registry.jsonl'),
      `${JSON.stringify({ id: 'github:jovie:production-continuity', status: 'live' })}\n`
    );
    assert.equal(main(root, { TURBO_SCM_BASE: base }), 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
