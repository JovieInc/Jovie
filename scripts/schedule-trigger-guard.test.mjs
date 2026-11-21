import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ALLOWLIST_PATH,
  ALLOWLIST_SCHEMA,
  collectAddedLines,
  diffBase,
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

test('the array and list schedule forms are caught too', () => {
  for (const lines of [
    ['on: [push, schedule]', 'jobs:', '  j:', '    runs-on: ubuntu-latest'],
    ['on:', '  - push', '  - schedule', 'jobs:', '  j:'],
  ]) {
    const errors = evaluateViolations({
      added: addedMap([['.github/workflows/alt-clock.yml', lines]]),
      allowlist: [],
      registryIds: new Set(),
    });
    assert.equal(errors.length, 1, JSON.stringify(lines));
    assert.match(errors[0], /alt-clock\.yml: adds a schedule/);
  }
  const noise = evaluateViolations({
    added: addedMap([
      [
        '.github/workflows/plain.yml',
        [
          'name: Enforce event-driven-only schedules',
          'on: push',
          'jobs:',
          '  j:',
        ],
      ],
    ]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(noise.length, 0);
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
    "    const r = await client.request('gh api repos/x/y');",
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

test('a for-await loop that re-reads the GitHub API is polling', () => {
  const errors = evaluateViolations({
    added: addedMap([
      [
        'scripts/drained.mjs',
        [
          'for await (const page of pages) {',
          '  await octokit.paginate(page)',
          '}',
        ],
      ],
    ]),
    allowlist: [],
    registryIds: new Set(),
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /polling/);
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

const pushOnly = 'on: push\njobs:\n  j:\n    steps:\n      - run: echo hi\n';
const withCron = cron =>
  `on:\n  schedule:\n    - cron: "${cron}"\njobs:\n  j:\n    steps:\n      - run: echo hi\n`;

async function shallowFixture() {
  const { execFileSync } = await import('node:child_process');
  const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import(
    'node:fs'
  );
  const { tmpdir } = await import('node:os');
  const root = mkdtempSync(join(tmpdir(), 'schedule-guard-shallow-'));
  const origin = join(root, 'origin');
  mkdirSync(join(origin, '.github', 'workflows'), { recursive: true });
  const run = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' });
  run(origin, 'init', '-q', '-b', 'main');
  run(origin, 'config', 'user.email', 't@jov.ie');
  run(origin, 'config', 'user.name', 'T');
  run(origin, 'config', 'uploadpack.allowReachableSHA1InWant', 'true');
  const write = (file, body) => writeFileSync(join(origin, file), body);
  const commit = message => {
    run(origin, 'add', '-A');
    run(origin, 'commit', '-qm', message);
    return run(origin, 'rev-parse', 'HEAD').trim();
  };
  const cloneBranch = branch => {
    const clone = join(root, `clone-${branch}`);
    execFileSync('git', [
      'clone',
      '-q',
      '--depth',
      '1',
      '--branch',
      branch,
      `file://${origin}`,
      clone,
    ]);
    return clone;
  };
  const eventFor = sha => {
    const event = join(root, `event-${sha.slice(0, 8)}.json`);
    writeFileSync(
      event,
      `${JSON.stringify({ pull_request: { base: { sha } } })}\n`
    );
    return event;
  };
  return {
    origin,
    run,
    write,
    commit,
    cloneBranch,
    eventFor,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('a depth-1 merge checkout catches a PR cron without the event payload', async () => {
  const fixture = await shallowFixture();
  try {
    fixture.write('.github/workflows/rogue.yml', withCron('*/2 * * * *'));
    fixture.commit('history once had the cron');
    fixture.write('.github/workflows/rogue.yml', pushOnly);
    const baseSha = fixture.commit('main removes the cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-branch');
    fixture.write('.github/workflows/rogue.yml', withCron('*/2 * * * *'));
    fixture.commit('PR re-adds the cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-merge', 'main');
    fixture.run(
      fixture.origin,
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'merge PR',
      'pr-branch'
    );
    const clone = fixture.cloneBranch('pr-merge');
    const event = fixture.eventFor(baseSha);
    assert.equal(diffBase(clone, {}), baseSha);
    assert.equal(main(clone, {}), 1);
    assert.equal(main(clone, { GITHUB_EVENT_PATH: event }), 1);
  } finally {
    fixture.cleanup();
  }
});

test('a stale event base does not flag a cron main already has', async () => {
  const fixture = await shallowFixture();
  try {
    fixture.write('.github/workflows/clock.yml', pushOnly);
    const staleSha = fixture.commit('before the daily cron');
    fixture.write('.github/workflows/clock.yml', withCron('7 14 * * *'));
    const mainSha = fixture.commit('main adds the daily cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-branch');
    fixture.write('README.md', 'docs only\n');
    fixture.commit('PR touches a readme');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-merge', 'main');
    fixture.run(
      fixture.origin,
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'merge PR',
      'pr-branch'
    );
    const clone = fixture.cloneBranch('pr-merge');
    const event = fixture.eventFor(staleSha);
    assert.equal(diffBase(clone, { GITHUB_EVENT_PATH: event }), mainSha);
    assert.equal(main(clone, { GITHUB_EVENT_PATH: event }), 0);
  } finally {
    fixture.cleanup();
  }
});

test('a PR that adds a cron still fails when the event base is stale', async () => {
  const fixture = await shallowFixture();
  try {
    fixture.write('.github/workflows/clock.yml', pushOnly);
    const staleSha = fixture.commit('older main');
    fixture.write('README.md', 'main moved\n');
    const mainSha = fixture.commit('main has no new cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-branch');
    fixture.write('.github/workflows/rogue.yml', withCron('*/9 * * * *'));
    fixture.commit('PR adds a cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-merge', 'main');
    fixture.run(
      fixture.origin,
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'merge PR',
      'pr-branch'
    );
    const clone = fixture.cloneBranch('pr-merge');
    const event = fixture.eventFor(staleSha);
    assert.equal(diffBase(clone, { GITHUB_EVENT_PATH: event }), mainSha);
    assert.equal(main(clone, { GITHUB_EVENT_PATH: event }), 1);
  } finally {
    fixture.cleanup();
  }
});

test('a local merge of main does not treat main cron as a PR addition', async () => {
  const fixture = await shallowFixture();
  try {
    fixture.write('.github/workflows/clock.yml', pushOnly);
    const staleSha = fixture.commit('feature point');
    fixture.write('.github/workflows/clock.yml', withCron('7 14 * * *'));
    const mainSha = fixture.commit('main adds the daily cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'feature', staleSha);
    fixture.write('README.md', 'feature note\n');
    fixture.commit('feature note');
    fixture.run(
      fixture.origin,
      'merge',
      '-q',
      '--no-ff',
      '-m',
      'merge main into feature',
      'main'
    );
    const clone = fixture.cloneBranch('feature');
    const event = fixture.eventFor(staleSha);
    assert.equal(diffBase(clone, { GITHUB_EVENT_PATH: event }), mainSha);
    assert.equal(main(clone, { GITHUB_EVENT_PATH: event }), 0);
  } finally {
    fixture.cleanup();
  }
});

test('a one-parent shallow checkout still uses the event base', async () => {
  const fixture = await shallowFixture();
  try {
    fixture.write('.github/workflows/clock.yml', pushOnly);
    const baseSha = fixture.commit('main without a cron');
    fixture.run(fixture.origin, 'checkout', '-qb', 'pr-branch');
    fixture.write('.github/workflows/rogue.yml', withCron('*/3 * * * *'));
    fixture.commit('PR adds a cron');
    const clone = fixture.cloneBranch('pr-branch');
    const event = fixture.eventFor(baseSha);
    assert.equal(diffBase(clone, {}), null);
    assert.equal(main(clone, {}), 0);
    assert.equal(diffBase(clone, { GITHUB_EVENT_PATH: event }), baseSha);
    assert.equal(main(clone, { GITHUB_EVENT_PATH: event }), 1);
  } finally {
    fixture.cleanup();
  }
});
