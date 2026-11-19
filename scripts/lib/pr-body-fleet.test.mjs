import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateFleetRules } from '../pr-fleet-rules.mjs';
import {
  escapeCommand,
  escapeProperty,
  fleetFindings,
  MAX_BODY,
  resolveMode,
  runCi,
} from './pr-body-fleet.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  // Temp repos must not inherit the host's signing helper (JOV-13094).
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};
const git = (cwd, ...a) =>
  execFileSync(
    'git',
    [
      '-c',
      'commit.gpgsign=false',
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      ...a,
    ],
    {
      cwd,
      env,
      encoding: 'utf8',
    }
  );

/** Repo whose HEAD is a merge commit (like refs/pull/N/merge): HEAD^1 = base. */
function mergeRepo(changes, { mode } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-'));
  git(dir, 'init', '-q', '-b', 'main');
  mkdirSync(join(dir, '.github'), { recursive: true });
  writeFileSync(join(dir, 'README.md'), 'x\n');
  if (mode)
    writeFileSync(
      join(dir, '.github/pr-body-lint.json'),
      JSON.stringify({ mode })
    );
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  git(dir, 'checkout', '-qb', 'feature');
  for (const [p, c] of Object.entries(changes)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'change');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'merge', 'feature');
  return dir;
}

function ci(dir, pr, extraEnv = {}) {
  const ev = join(dir, '..', `${Math.random()}.json`);
  writeFileSync(
    ev,
    JSON.stringify({
      action: 'edited',
      pull_request: pr,
      repository: { full_name: 'JovieInc/Jovie' },
    })
  );
  const out = [];
  const summary = join(dir, '..', `${Math.random()}.md`);
  const receipt = join(dir, '..', `${Math.random()}.json`);
  const r = runCi({
    cwd: dir,
    env: {
      GITHUB_EVENT_PATH: ev,
      GITHUB_STEP_SUMMARY: summary,
      PR_BODY_LINT_RECEIPT: receipt,
      ...extraEnv,
    },
    log: l => out.push(l),
  });
  return {
    ...r,
    out,
    summary: readFileSync(summary, { flag: 'a+', encoding: 'utf8' }),
  };
}

const PR = (o = {}) => ({
  number: 7,
  title: 'fix: broken thing',
  body: 'no sections',
  labels: [],
  user: { login: 'dev', type: 'User' },
  head: { repo: { fork: false } },
  ...o,
});

test('fleetFindings is exactly evaluateFleetRules (no copied rules)', () => {
  const input = {
    title: 'fix: x',
    body: 'b',
    labels: ['bug'],
    files: [{ filename: 'apps/web/a.ts', status: 'modified' }],
  };
  const ours = fleetFindings(input);
  const theirs = evaluateFleetRules({
    pr: { title: input.title, body: input.body, labels: input.labels },
    files: input.files,
  });
  assert.deepEqual(
    ours.errors.map(e => e.message),
    theirs.errors
  );
  assert.deepEqual(
    ours.warnings.map(e => e.message),
    theirs.warnings
  );
  assert.ok(
    ours.errors.every(e => e.rule && e.fix),
    'every error carries a rule id and a fix'
  );
});

test('warn mode: violations are annotations, exit 0, summary lists rule + fix', () => {
  const dir = mergeRepo({ 'apps/web/a.ts': 'x\n' });
  const r = ci(dir, PR());
  assert.equal(r.code, 0);
  assert.ok(
    r.out.some(l => l.startsWith('::warning title=PR body red-before-green::'))
  );
  assert.match(r.summary, /\| rule \| red-before-green \|/);
  assert.match(r.summary, /how to fix/);
  assert.deepEqual(r.receipt.errors, ['red-before-green']);
  assert.equal(r.receipt.filesSource, 'git');
  rmSync(dir, { recursive: true, force: true });
});

test('clean body: no warning annotations', () => {
  const dir = mergeRepo({ 'apps/web/a.ts': 'x\n' });
  const body =
    '## Blast radius\n- What could break: nothing else\n- Proof: unit tests pass\n';
  const r = ci(dir, PR({ title: 'docs: tidy', body }));
  assert.equal(r.code, 0);
  assert.equal(r.out.filter(l => l.startsWith('::warning')).length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('enforce mode (base config) fails; repo var can only turn it off', () => {
  const dir = mergeRepo({ 'apps/web/a.ts': 'x\n' }, { mode: 'enforce' });
  assert.equal(ci(dir, PR()).code, 1);
  assert.equal(ci(dir, PR(), { PR_BODY_LINT_MODE_OVERRIDE: 'off' }).code, 0);
  assert.equal(
    resolveMode({ configured: 'warn', override: 'enforce' }),
    'warn'
  );
  assert.equal(resolveMode({ configured: 'bogus' }), 'warn');
  rmSync(dir, { recursive: true, force: true });
});

test('a PR cannot raise its own mode: config is read from HEAD^1 (base)', () => {
  const dir = mergeRepo(
    { '.github/pr-body-lint.json': '{"mode":"off"}', 'apps/web/a.ts': 'x\n' },
    { mode: 'warn' }
  );
  assert.equal(ci(dir, PR()).receipt.mode, 'warn');
  rmSync(dir, { recursive: true, force: true });
});

test('adversarial: file path and title cannot inject workflow commands', () => {
  const evil = 'packages/ui/styles/design-system.css';
  const dir = mergeRepo({
    [evil]: 'x\n',
    'apps/web/auth/a\n::error::pwned\n%0A.ts': 'x\n',
  });
  const r = ci(
    dir,
    PR({
      title: 'fix: ::set-output name=x::y\n::error::t',
      body: '%0A::error::b\r\n',
    })
  );
  for (const line of r.out) {
    assert.ok(
      !line.includes('\n') && !line.includes('\r'),
      'one command per line'
    );
    assert.ok(
      /^::(warning|notice|error) title=[^:]*::/.test(line),
      `well-formed: ${line.slice(0, 80)}`
    );
  }
  assert.ok(!r.out.some(l => /^::error::pwned/.test(l)));
  assert.equal(escapeCommand('a\n::b%'), 'a%0A::b%25');
  assert.equal(escapeProperty('x:y,z'), 'x%3Ay%2Cz');
  assert.ok(!r.summary.includes('<img'), 'summary escapes html');
  rmSync(dir, { recursive: true, force: true });
});

test('worst-case body at the GitHub 65,536-char cap stays fast', () => {
  // The red-output fence regex is superlinear on many ``` lines (~5.7 s at
  // 220k chars), but GitHub caps PR bodies at 65,536 chars (~90 ms measured).
  // pr-body-lint rejects longer local bodies before evaluating them.
  const pre = '## Red-before-green\n';
  const body = pre + '```\n'.repeat(((MAX_BODY - pre.length) / 4) | 0);
  const t0 = Date.now();
  fleetFindings({ title: 'fix: x', body, files: [] });
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0}ms`); // wall-clock-ok: GitHub 65,536-char body cap must stay under the 3-minute job budget
});

test('unmergeable PR (no merge parent): body-only, marked partial, still exit 0', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pbl-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a'), 'a');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'only');
  const r = ci(dir, PR());
  assert.equal(r.code, 0);
  assert.equal(r.receipt.filesSource, 'unavailable');
  rmSync(dir, { recursive: true, force: true });
});

test('bot-opened PR is linted like any other and tagged in the receipt', () => {
  const dir = mergeRepo({ 'package.json': '{}\n' });
  const r = ci(
    dir,
    PR({
      title: 'chore(deps): bump x',
      user: { login: 'dependabot[bot]', type: 'Bot' },
    })
  );
  assert.equal(r.code, 0);
  assert.equal(r.receipt.authorType, 'Bot');
  rmSync(dir, { recursive: true, force: true });
});

test('CLI never fails the job on infrastructure errors', () => {
  const r = spawnSync(
    process.execPath,
    [join(here, 'pr-body-fleet.mjs'), '--ci'],
    {
      env: { ...process.env, GITHUB_EVENT_PATH: '/nonexistent.json' },
      encoding: 'utf8',
    }
  );
  assert.equal(r.status, 0);
  assert.match(r.stdout, /::warning title=PR body lint unavailable::/);
});
