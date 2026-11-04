import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { validateReceipt } from '../golden-path-lock.mjs';
import {
  resolveGoldenPathSourceScope,
  unrelatedToGoldenPath,
} from '../golden-path-source-scope.mjs';

const root = resolve(import.meta.dirname, '../../..');
const temporary = [];
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture(paths = ['docs/company/shipping.md']) {
  const dir = mkdtempSync(join(tmpdir(), 'golden-source-scope-'));
  temporary.push(dir);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.com',
    GIT_COMMITTER_NAME: 'fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.com',
  };
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'README.md'), 'base');
  git('add', '.');
  git('commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD');
  git('remote', 'add', 'origin', dir);
  git('checkout', '-qb', 'candidate');
  for (const path of paths) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), 'change');
  }
  git('add', '.');
  git('commit', '--allow-empty', '-qm', 'candidate');
  const head = git('rev-parse', 'HEAD');
  const event = /** @type {Record<string, any>} */ ({
    pull_request: { base: { sha: base, ref: 'main' }, head: { sha: head } },
  });
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'pnpm'),
    '#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.CALLS, JSON.stringify(process.argv.slice(2))+"\\n"); process.exit(Number(process.env.FIXTURE_TEST_EXIT || 0));\n'
  );
  chmodSync(join(bin, 'pnpm'), 0o755);
  return { dir, env, git, base, head, event, bin };
}
function gate(f, overrides = {}, verifyDirectProof = true) {
  const eventPath = join(f.dir, 'event.json');
  writeFileSync(eventPath, JSON.stringify(f.event));
  const calls = join(f.dir, 'calls.jsonl');
  const receipt = join(f.dir, 'receipt.json');
  const result = spawnSync(
    process.execPath,
    [
      join(root, 'scripts/golden-path-lock.mjs'),
      'merge-gate',
      '--receipt',
      receipt,
    ],
    {
      cwd: f.dir,
      encoding: 'utf8',
      env: {
        ...f.env,
        PATH: `${f.bin}:${process.env.PATH}`,
        CALLS: calls,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_SHA: f.head,
        ...overrides,
      },
    }
  );
  const proof = resolveGoldenPathSourceScope(
    {
      ...f.env,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_SHA: f.head,
      ...overrides,
    },
    f.dir
  );
  if (verifyDirectProof)
    expect(JSON.parse(readFileSync(receipt, 'utf8')).sourceScope).toEqual(
      proof
    );
  return {
    ...result,
    calls: readFileSync(calls, 'utf8')
      .trim()
      .split('\n')
      .map(text => JSON.parse(text)),
    receipt: JSON.parse(readFileSync(receipt, 'utf8')),
  };
}
it('runs only lock self-tests for a verified unrelated source delta', () => {
  const r = gate(fixture());
  expect(r.status, r.stderr).toBe(0);
  expect(r.calls).toHaveLength(1);
  expect(r.calls[0]).not.toContain('@jovie/web');
  expect(r.receipt.testFiles).toEqual([]);
  expect(r.receipt.sourceScope.verified).toBe(true);
});
for (const path of [
  'apps/web/app/start/page.tsx',
  'apps/web/lib/auth/session.ts',
  'apps/web/app/(home)/page.tsx',
  'packages/ui/Button.tsx',
  'pnpm-lock.yaml',
  '.github/workflows/ci.yml',
  'scripts/ci-fast-lanes.mjs',
  'unknown/new.ts',
]) {
  it(`keeps product tests for affected/shared/unknown input: ${path}`, () => {
    const r = gate(fixture([path]));
    expect(r.status).toBe(0);
    expect(r.calls).toHaveLength(2);
    expect(r.calls[0]).toContain('@jovie/web');
  });
}
it('does not use caller-provided changed files as absence proof', () => {
  const r = gate(fixture(['apps/web/app/start/page.tsx']), {
    GOLDEN_PATH_CHANGED_FILES: 'docs/company/safe.md',
    GITHUB_EVENT_NAME: '',
  });
  expect(r.calls).toHaveLength(2);
});
it('covers earlier golden-path entries in a docs-only merge-group tail', () => {
  const f = fixture(['apps/web/app/start/page.tsx']);
  const previous = f.head;
  mkdirSync(join(f.dir, 'docs/company'), { recursive: true });
  writeFileSync(join(f.dir, 'docs/company/a.md'), 'tail');
  f.git('add', '.');
  f.git('commit', '-qm', 'queue tail');
  f.head = f.git('rev-parse', 'HEAD');
  f.event = {
    merge_group: {
      base_sha: previous,
      head_sha: f.head,
      base_ref: 'refs/heads/main',
    },
  };
  const r = gate(f, { GITHUB_EVENT_NAME: 'merge_group' });
  expect(r.calls).toHaveLength(2);
  expect(r.receipt.sourceScope.files).toContain('apps/web/app/start/page.tsx');
});
it('keeps self-test failure blocking even for unrelated source', () => {
  const r = gate(fixture(), { FIXTURE_TEST_EXIT: '1' });
  expect(r.status).toBe(1);
  expect(r.receipt.ok).toBe(false);
});

for (const path of [
  'scripts/lib/ci-metrics-compute.mjs',
  'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
  'scripts/lib/ci-rounds.mjs',
  'scripts/lib/__tests__/ci-rounds.test.mjs',
  'content/investors/update.md',
  'apps/web/app/(marketing)/about/page.tsx',
  'apps/web/app/(marketing)/support/SupportContent.tsx',
]) {
  it(`selects only self-tests for isolated unrelated path: ${path}`, () => {
    const r = gate(fixture([path]));
    expect(r.status, r.stderr).toBe(0);
    expect(r.calls).toHaveLength(1);
  });
}
for (const path of [
  'scripts/lanes/gh_app_token.py',
  'scripts/lanes/execution_attempt.py',
  'scripts/lanes/new.py',
  'scripts/backlog-orchestrator/new.mjs',
  'scripts/fleet-gate/new.mjs',
  'scripts/verification/new.py',
  'apps/web/lib/billing/check.ts',
  'apps/web/components/marketing/Header.tsx',
  'apps/web/app/(marketing)/layout.tsx',
  'apps/web/app/(marketing)/unknown/page.tsx',
  'scripts/lanes/package.json',
  'scripts/lanes/vitest.config.mjs',
  'scripts/golden-path-lock.mjs',
  'scripts/lib/golden-path-source-scope.mjs',
  'apps/web/data/marketing/routeManifest.ts',
]) {
  it(`retains coverage for shared/config/unknown neighbor: ${path}`, () => {
    const r = gate(fixture([path]));
    expect(r.calls).toHaveLength(2);
  });
}
it('treats an empty delta as unknown applicability', () => {
  expect(gate(fixture([])).calls).toHaveLength(2);
});
it('fails closed on unavailable current base', () => {
  const f = fixture();
  f.git('remote', 'remove', 'origin');
  expect(gate(f).calls).toHaveLength(2);
});
it('fails closed on unavailable event base', () => {
  const f = fixture();
  f.event.pull_request.base.sha = 'a'.repeat(40);
  expect(gate(f).calls).toHaveLength(2);
});
it('fails closed on malformed event identity', () => {
  const f = fixture();
  f.event.pull_request.head.sha = '--bad';
  expect(gate(f).calls).toHaveLength(2);
});
it('does not mistake a one-parent checkout for the synthetic merge', () => {
  const f = fixture();
  f.event.pull_request.head.sha = f.base;
  expect(gate(f).calls).toHaveLength(2);
});
it('rejects dirty tracked source as absence proof', () => {
  const f = fixture();
  writeFileSync(join(f.dir, 'README.md'), 'dirty');
  expect(gate(f).calls).toHaveLength(2);
});
it('covers current base drift even when the event delta is unrelated', () => {
  const f = fixture();
  f.git('checkout', '-q', 'main');
  mkdirSync(join(f.dir, 'apps/web/lib/auth'), { recursive: true });
  writeFileSync(join(f.dir, 'apps/web/lib/auth/a.ts'), 'drift');
  f.git('add', 'apps/web/lib/auth/a.ts');
  f.git('commit', '-qm', 'base advanced');
  f.git('checkout', '-q', 'candidate');
  const r = gate(f);
  expect(r.calls).toHaveLength(2);
  expect(r.receipt.sourceScope.files).toContain('apps/web/lib/auth/a.ts');
});
it('accepts an exact synthetic PR merge with both event parents', () => {
  const f = fixture();
  f.git('checkout', '-q', 'main');
  f.git('merge', '--no-ff', '-qm', 'synthetic', 'candidate');
  const synthetic = f.git('rev-parse', 'HEAD');
  const r = gate(f, { GITHUB_SHA: synthetic });
  expect(r.calls).toHaveLength(1);
  expect(r.receipt.sourceScope.head).toBe(synthetic);
});
it('keeps deleted and renamed golden-path paths in the union', () => {
  const f = fixture(['apps/web/lib/auth/a.ts']);
  f.git('branch', '-f', 'main', f.head);
  f.event.pull_request.base.sha = f.head;
  mkdirSync(join(f.dir, 'docs/company'), { recursive: true });
  f.git('mv', 'apps/web/lib/auth/a.ts', 'docs/company/moved.md');
  f.git('commit', '-qm', 'move');
  f.head = f.git('rev-parse', 'HEAD');
  f.event.pull_request.head.sha = f.head;
  const r = gate(f);
  expect(r.calls).toHaveLength(2);
  expect(r.receipt.sourceScope.files).toContain('apps/web/lib/auth/a.ts');
});

it('rejects ambiguous or malformed paths rather than normalizing them into exclusions', () => {
  for (const path of [
    null,
    '',
    '/docs/company/a.md',
    'docs/company/../a.md',
    'docs//company/a.md',
    './docs/company/a.md',
    'docs\\company\\a.md',
    'docs/company/a\n.md',
    'scripts/lanes/requirements.txt',
  ])
    expect(unrelatedToGoldenPath(path)).toBe(false);
});
it('rejects a passing omission receipt without its source and self-test evidence', () => {
  const r = gate(fixture()).receipt;
  for (const bad of [
    { ...r, sourceScope: undefined },
    { ...r, sourceScope: { ...r.sourceScope, files: [] } },
    {
      ...r,
      sourceScope: { ...r.sourceScope, files: ['apps/web/app/start/page.tsx'] },
    },
    { ...r, checks: [] },
    { ...r, checks: {} },
    { ...r, testFiles: ['unexpected'] },
    { ...r, checks: r.checks.map(check => ({ ...check, ok: false })) },
  ])
    expect(validateReceipt(bad).ok).toBe(false);
});

it('fails closed if the target branch moves while collecting the diff', () => {
  const f = fixture();
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  writeFileSync(
    join(f.bin, 'git'),
    `#!/usr/bin/env node
const {spawnSync}=require('node:child_process'); const args=process.argv.slice(2);
if(args[0]==='diff') spawnSync(${JSON.stringify(realGit)}, ['update-ref','refs/heads/main',${JSON.stringify(f.head)}], {stdio:'inherit'});
const result=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}); process.exit(result.status ?? 1);
`
  );
  chmodSync(join(f.bin, 'git'), 0o755);
  const r = gate(f, {}, false);
  expect(r.receipt.sourceScope.verified).toBe(false);
  expect(r.calls).toHaveLength(2);
});
it('fails closed on an incomplete changed-path stream', () => {
  const f = fixture();
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  writeFileSync(
    join(f.bin, 'git'),
    `#!/usr/bin/env node
const {spawnSync}=require('node:child_process'); const args=process.argv.slice(2);
if(args[0]==='diff') { process.stdout.write('docs/company/a.md'); process.exit(0); }
const result=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit'}); process.exit(result.status ?? 1);
`
  );
  chmodSync(join(f.bin, 'git'), 0o755);
  const r = gate(f, {}, false);
  expect(r.receipt.sourceScope.verified).toBe(false);
  expect(r.calls).toHaveLength(2);
});
it('keeps pure CI measurement dependencies outside product source', () => {
  const references = execFileSync(
    'git',
    [
      'grep',
      '-l',
      '-e',
      'ci-rounds.mjs',
      '-e',
      'ci-metrics-compute.mjs',
      '--',
      '*.mjs',
      '*.js',
      '*.ts',
      '*.tsx',
    ],
    { cwd: root, encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .sort();
  expect(references).toEqual(
    [
      'scripts/lib/__tests__/ci-metrics-compute.test.mjs',
      'scripts/lib/__tests__/ci-rounds.test.mjs',
      'scripts/lib/__tests__/golden-path-source-scope.test.mjs',
      'scripts/lib/golden-path-source-scope.mjs',
      'scripts/lib/merge-queue-guard.mjs',
      'scripts/preflight-changed.mjs',
      'scripts/shipping-slo-report.mjs',
    ].sort()
  );
});
