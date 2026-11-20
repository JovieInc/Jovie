// JOV-13091: pr-body-lint is the one PR-body check. These tests pin that the
// gate pr-open enforces before any GitHub write is the same implementation the
// advisory lint lane runs, and that its rules come from the server-side
// Fleet Rules module as-is.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { gate, PR_URL_PLACEHOLDER } from './pr-body-lint.mjs';
import { evaluateFleetRules } from './pr-fleet-rules.mjs';
import { CUSTOMER_MARKER, draftBody, main } from './pr-open.mjs';

const file = (filename, status = 'modified') => ({ filename, status });
const ok = data => ({ status: 0, stdout: JSON.stringify(data), stderr: '' });
const okText = stdout => ({ status: 0, stdout, stderr: '' });

const VALID_BODY = [
  'Chore summary.',
  '',
  CUSTOMER_MARKER,
  '',
  '## Blast radius',
  '',
  '- What could break: consumers of scripts outside this diff.',
  '- Proof: `scripts/pr-body-lint.test.mjs` covers the changed behaviour.',
].join('\n');

test('a valid body passes the gate', () => {
  assert.deepEqual(
    gate({
      title: 'chore: tidy',
      body: VALID_BODY,
      files: [file('scripts/x.mjs')],
    }).errors,
    []
  );
});

test('each missing section fails with its rule id', () => {
  assert.ok(
    gate({
      title: 'fix(ci): regression',
      body: VALID_BODY,
      files: [file('scripts/x.mjs')],
    }).errors.some(e => e.startsWith('red-before-green:'))
  );
  assert.ok(
    gate({
      title: 'chore: tidy',
      body: VALID_BODY,
      labels: ['compounding'],
      files: [file('scripts/x.mjs')],
    }).errors.some(e => e.startsWith('win:'))
  );
  assert.ok(
    gate({
      title: 'chore: tidy',
      body: VALID_BODY,
      files: [file('apps/web/styles/design-system.css')],
    }).errors.some(e => e.startsWith('locked-areas:'))
  );
  assert.ok(
    gate({
      title: 'chore: tidy',
      body: `${VALID_BODY}\n<what changed>`,
      files: [file('scripts/x.mjs')],
    }).errors.some(e => e.startsWith('placeholder:'))
  );
  assert.ok(
    gate({
      title: 'chore: tidy',
      body: VALID_BODY,
      files: [file('scripts/x.mjs')],
      extra: ['target: body references PR #9, destination is #10'],
    }).errors.some(e => e.startsWith('target:'))
  );
});

test('the gate is one shared implementation, not a copy', async () => {
  // pr-open imports the check back and re-exports the same function object.
  const prOpen = await import('./pr-open.mjs');
  assert.equal(prOpen.gate, gate);
  // The rules come from the server-side Fleet Rules module as-is.
  const source = readFileSync(
    path.join(import.meta.dirname, 'pr-body-lint.mjs'),
    'utf8'
  );
  assert.match(source, /from '\.\/pr-fleet-rules\.mjs'/);
  for (const workflow of [
    '.github/workflows/pr-fleet-rules.yml',
    '.github/workflows/fleet-rules-evidence.yml',
  ])
    assert.ok(
      readFileSync(
        path.join(import.meta.dirname, '..', workflow),
        'utf8'
      ).includes('scripts/pr-fleet-rules.mjs'),
      `${workflow} runs the shared rules module`
    );
  // Functional no-drift proof: identical locked-areas verdict both ways.
  const files = [file('apps/web/styles/design-system.css')];
  const shared = evaluateFleetRules({
    pr: { title: 'chore: x', body: 'no citation', labels: [] },
    files,
  }).errors.filter(e => e.startsWith('locked-areas:'));
  assert.equal(shared.length, 1);
  assert.ok(
    gate({ title: 'chore: x', body: 'no citation', files }).errors.includes(
      shared[0]
    )
  );
});

test('the placeholder is the exact shared constant', () => {
  const body = draftBody({
    title: 'perf(ci): x',
    files: [],
    metric: 'setup | s | lower | 2 | local | pnpm test',
  });
  assert.ok(body.includes(PR_URL_PLACEHOLDER));
});

function localRepo() {
  const repo = mkdtempSync(path.join(tmpdir(), 'pr-body-lint-repo-'));
  const git = args => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
  git(['init']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
  writeFileSync(path.join(repo, 'base.txt'), 'base');
  git(['add', '.']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'base']);
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  writeFileSync(path.join(repo, 'new.txt'), 'new');
  git(['add', '.']);
  git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'chore: change']);
  return {
    repo,
    cleanup: () => rmSync(repo, { recursive: true, force: true }),
  };
}

/** git/node answers the open flow needs; records nothing. */
function diffRunner(command, args) {
  if (command === 'git' && args[0] === 'rev-parse')
    return okText(args[1] === 'HEAD' ? 'c'.repeat(40) : args[1]);
  if (command === 'git' && args[0] === 'show') return okText('// trusted');
  if (command === 'git' && args[0] === 'merge-base') return okText('base');
  if (command === 'git' && args[0] === 'branch')
    return okText('fixture/source');
  if (command === 'git' && args[0] === 'ls-remote')
    return okText(`${'c'.repeat(40)}\trefs/heads/fixture/source\n`);
  if (command === 'git' && args[0] === 'log') return okText('chore: fixture');
  return args.includes('--plan') ? ok({ applicable: false }) : okText('');
}

test('open --ready --auto-merge arms ready and squash only after the gates pass', async () => {
  const { repo, cleanup } = localRepo();
  const filename = path.join(repo, 'body.md');
  writeFileSync(filename, VALID_BODY);
  const calls = [];
  try {
    const code = await main(
      [
        'open',
        '--repo',
        repo,
        '--body-file',
        filename,
        '--ready',
        '--auto-merge',
      ],
      () => {},
      {
        execute: diffRunner,
        github: (_cwd, args) => {
          calls.push(args);
          return args[1] === 'create'
            ? okText('https://github.com/JovieInc/Jovie/pull/42\n')
            : okText('');
        },
        diagnose: () => {},
      }
    );
    assert.equal(code, 0);
    assert.deepEqual(calls.find(a => a[1] === 'ready')?.slice(0, 3), [
      'pr',
      'ready',
      'https://github.com/JovieInc/Jovie/pull/42',
    ]);
    assert.deepEqual(calls.find(a => a[1] === 'merge')?.slice(0, 5), [
      'pr',
      'merge',
      'https://github.com/JovieInc/Jovie/pull/42',
      '--auto',
      '--squash',
    ]);
  } finally {
    cleanup();
  }
});

test('a failed ready step fails the run after publication', async () => {
  const { repo, cleanup } = localRepo();
  const filename = path.join(repo, 'body.md');
  writeFileSync(filename, VALID_BODY);
  try {
    const out = [];
    const code = await main(
      ['open', '--repo', repo, '--body-file', filename, '--ready'],
      line => out.push(line),
      {
        execute: diffRunner,
        github: (_cwd, args) =>
          args[1] === 'create'
            ? okText('https://github.com/JovieInc/Jovie/pull/42\n')
            : { status: 1, stdout: '', stderr: 'not a draft' },
        diagnose: () => {},
      }
    );
    assert.equal(code, 1);
    assert.match(out.join('\n'), /FAIL {2}ready: not a draft/);
  } finally {
    cleanup();
  }
});

test('update --auto-merge arms squash after the body edit lands', async () => {
  const pr = {
    number: 42,
    title: 'chore: target PR',
    body: 'Original target body',
    labels: [],
    headRefName: 'target-branch',
    headRefOid: 'a'.repeat(40),
    baseRefOid: 'b'.repeat(40),
    baseRefName: 'main',
    url: 'https://github.com/JovieInc/Jovie/pull/42',
    changedFiles: 1,
  };
  const fresh = id =>
    ['PR Fleet Rules', 'Source Validation'].map((name, i) => ({
      id: id + i,
      name,
      event: 'pull_request',
      head_sha: pr.headRefOid,
      head_branch: pr.headRefName,
      pull_requests: [{ number: pr.number }],
      html_url: `https://github.com/JovieInc/Jovie/actions/runs/${id + i}`,
    }));
  const calls = [];
  let reads = 0;
  const code = await main(['update', '42', '--auto-merge'], () => {}, {
    github: (_cwd, args) => {
      calls.push(args);
      if (args[0] === 'pr' && args[1] === 'view') return ok(pr);
      if (args.some(a => a.includes('/files?')))
        return ok([[file('apps/web/lib/target/own.test.ts', 'added')]]);
      if (args[0] === 'run') return ok([]);
      if (args.includes('PATCH')) return okText('');
      if (args[0] === 'pr' && args[1] === 'merge') return okText('');
      if (args[0] === 'api')
        return ok({ workflow_runs: reads++ ? fresh(3) : fresh(1) });
      throw new Error(`unexpected ${args.join(' ')}`);
    },
    execute: diffRunner,
    diagnose: () => {},
    pause: async () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(calls.find(a => a[1] === 'merge')?.slice(0, 5), [
    'pr',
    'merge',
    '42',
    '--auto',
    '--squash',
  ]);
});
