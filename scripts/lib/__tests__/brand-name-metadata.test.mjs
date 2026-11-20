import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import { test, vi } from 'vitest';
import {
  EXCEPTIONS,
  readScanFile,
  scanText,
} from '../../anti-slop/brand-name.mjs';
import {
  main as runMessages,
  scanPullRequestText,
} from '../../anti-slop/brand-name-messages.mjs';
import { commit, git, put, repo } from './brand-name-test-fixtures.mjs';

function metadataStep() {
  const workflow =
    /** @type {{jobs: {deterministic: {steps: Array<{name?: string, run?: string}>}}}} */ (
      yamlLoad(
        readFileSync(resolve('.github/workflows/source-validation.yml'), 'utf8')
      )
    );
  const step = workflow.jobs.deterministic.steps.find(
    s => s.name === 'Check brand spelling in PR text and commit messages'
  );
  assert.ok(step && typeof step.run === 'string');
  return step;
}

function putGuardSources(root) {
  const source = resolve('scripts/anti-slop');
  for (const name of readdirSync(source).filter(n =>
    /\.(?:mjs|json)$/u.test(n)
  ))
    put(root, `scripts/anti-slop/${name}`, readFileSync(join(source, name)));
}

function runMetadata(root, title, body, head) {
  const step = metadataStep();
  assert.ok(!step.run.includes('${{'));
  const temp = join(root, 'runner-temp');
  mkdirSync(temp);
  const result = spawnSync('bash', ['-c', step.run], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      RUNNER_TEMP: temp,
      BASE_BRANCH: 'main',
      HEAD_SHA: head,
      PR_TITLE: title,
      PR_BODY: body,
    },
  });
  return { temp, result };
}

test('Source Validation isolates title, body and each commit using only the trusted guard', () => {
  const root = repo();
  putGuardSources(root);
  commit(root);
  git(root, 'remote', 'add', 'origin', root);
  git(root, 'checkout', '-qb', 'feature');
  git(root, 'commit', '--allow-empty', '-qm', 'feat: fix Jovy');
  const head = git(root, 'rev-parse', 'HEAD');
  // A PR-controlled guard must never be executed by this workflow.
  put(
    root,
    'scripts/anti-slop/brand-name-messages.mjs',
    'throw new Error("PR CONTROLLED CODE EXECUTED");'
  );
  const { temp, result } = runMetadata(
    root,
    'Safe title',
    '```\nunclosed body fence',
    head
  );
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Jovy/u);
  assert.doesNotMatch(result.stderr, /PR CONTROLLED CODE EXECUTED/u);
  assert.deepEqual(readdirSync(temp), []);
});

test('metadata scans isolate fence state and attribute each section and commit', async () => {
  const { scanPullRequestText } = await import(
    '../../anti-slop/brand-name-messages.mjs'
  );
  const root = repo();
  put(root, 'a.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  git(
    root,
    'commit',
    '--allow-empty',
    '-qm',
    '```\nfirst commit with an unclosed fence'
  );
  git(root, 'commit', '--allow-empty', '-qm', 'feat(jovie): repair Jovy');
  const head = git(root, 'rev-parse', 'HEAD');
  const hits = scanPullRequestText({
    root,
    base,
    head,
    title: '```',
    body: 'Jovee in body',
  });
  assert.deepEqual(
    hits.map(h => h.text),
    ['Jovee', 'Jovy']
  );
  assert.equal(hits[0].file, 'PR body');
  assert.equal(hits[1].file, `commit ${head}`);
});

test('metadata CLI returns a failing verdict for prose and a clean verdict for empty sections', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  try {
    assert.equal(
      runMessages([base, base], { root, title: 'Jovy', body: 'Safe' }),
      1
    );
    assert.match(err.mock.calls.flat().join(''), /PR title:1.*Jovy/u);
    assert.equal(
      runMessages([base, base], { root, title: 'Jovie', body: '' }),
      0
    );
    assert.deepEqual(scanPullRequestText({ root, base, head: base }), []);
    assert.throws(() => runMessages([]), /full head SHA/u);
    assert.throws(() => runMessages([base, 'bad']), /full head SHA/u);
  } finally {
    err.mockRestore();
  }
});

test('Source Validation skips adoption only while the helper is absent on the trusted base', () => {
  const root = repo();
  put(root, 'readme.md', 'Jovie');
  commit(root);
  git(root, 'remote', 'add', 'origin', root);
  const head = git(root, 'rev-parse', 'HEAD');
  const { temp, result } = runMetadata(root, 'Jovy', 'Jovy', head);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /guard not on main yet; skipping/u);
  assert.deepEqual(readdirSync(temp), []);
});

test('Source Validation treats shell metacharacters in PR text as data and cleans up on success', () => {
  const root = repo();
  putGuardSources(root);
  commit(root);
  git(root, 'remote', 'add', 'origin', root);
  const head = git(root, 'rev-parse', 'HEAD');
  const sentinel = join(root, 'must-not-exist');
  const { temp, result } = runMetadata(
    root,
    `Jovie $(touch '${sentinel}')`,
    `Jovie \`touch '${sentinel}'\``,
    head
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readScanFile(sentinel, root), null);
  assert.deepEqual(readdirSync(temp), []);
});

test('immutable commit exceptions apply only to the exact evidenced span and commit identity', () => {
  const root = repo();
  put(root, 'copy.md', 'Jovie');
  commit(root);
  const base = git(root, 'rev-parse', 'HEAD');
  const quoted = 'Negative spelling examples: Jovy and Jovies.';
  git(root, 'commit', '--allow-empty', '-qm', quoted);
  const head = git(root, 'rev-parse', 'HEAD');
  const exceptions = [
    {
      file: `commit ${head}`,
      match: quoted,
      reason: 'Exact negative examples in this immutable fixture commit.',
    },
  ];
  assert.deepEqual(scanPullRequestText({ root, base, head, exceptions }), []);
  assert.deepEqual(
    scanPullRequestText({
      root,
      base,
      head,
      exceptions,
      title: 'Jovy',
      body: 'Jovies',
    }).map(h => h.file),
    ['PR title', 'PR body']
  );
  git(root, 'commit', '--allow-empty', '-qm', quoted);
  const next = git(root, 'rev-parse', 'HEAD');
  assert.deepEqual(
    scanPullRequestText({ root, base: head, head: next, exceptions }).map(
      h => h.text
    ),
    ['Jovy', 'Jovies']
  );
});

test('the published implementation commit freezes only its original negative examples', () => {
  const file = 'commit 3ce9dca0e29780a21a36e524aa251c8092abdb51';
  const exception = EXCEPTIONS.find(e => e.file === file);
  assert.ok(exception && exception.reason.trim());
  assert.deepEqual(scanText(exception.match, { file, prose: true }), []);
  assert.deepEqual(
    scanText(exception.match + '\nJovy', { file, prose: true }).map(
      h => h.text
    ),
    ['Jovy']
  );
  assert.ok(
    scanText(exception.match, { file: 'PR body', prose: true }).length > 0
  );
});
