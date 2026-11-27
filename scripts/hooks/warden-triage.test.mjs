import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { parseNumstat, SKIP_EXIT, triage } from './warden-triage.mjs';

const script = resolve(import.meta.dirname, 'warden-triage.mjs');
const row = (path, added = 10, deleted = 0) => ({ path, added, deleted });
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('warden-triage', () => {
  it('skips an empty diff', () => {
    assert.deepEqual(triage([]), { review: false, reason: 'no changes' });
  });

  it('skips docs, lockfiles and assets', () => {
    const verdict = triage([
      row('docs/notes.md', 200),
      row('pnpm-lock.yaml', 900),
      row('apps/web/public/logo.png', null, null),
    ]);
    assert.equal(verdict.review, false);
    assert.match(verdict.reason, /only docs/);
  });

  it('reviews even a tiny code diff', () => {
    const verdict = triage([row('apps/web/lib/format.ts', 1, 1)]);
    assert.equal(verdict.review, true);
    assert.match(verdict.reason, /2 changed lines/);
  });

  it('reviews an ordinary code change', () => {
    const verdict = triage([
      row('apps/web/lib/format.ts', 8, 2),
      row('README.md', 4),
    ]);
    assert.equal(verdict.review, true);
    assert.match(verdict.reason, /1 code file\(s\), 14 changed lines/);
  });

  it('always reviews risky paths, even tiny or test-only ones', () => {
    for (const path of [
      'apps/web/lib/auth/session.ts',
      'apps/web/lib/billing/stripe.ts',
      'packages/db/migrations/0042_add_index.sql',
      'supabase/migrations/20261125_policy.sql',
      '.github/workflows/ci.yml',
      'apps/web/proxy.ts',
      'apps/web/middleware.ts',
      'apps/web/app/api/users/route.ts',
      'apps/web/lib/webhooks/linear.ts',
      'scripts/security/scan-secrets.sh',
      'apps/web/.env.example',
      'apps/web/tests/unit/api/webhooks/linear.test.ts',
    ]) {
      const verdict = triage([row(path, 1, 0)]);
      assert.equal(verdict.review, true, path);
      assert.match(verdict.reason, /risky path/, path);
    }
  });

  it('reviews instructions, configuration, removed assertions and renamed risk paths', () => {
    for (const path of [
      'AGENTS.md',
      'canon/ENGINEERING.md',
      '.claude/rules/ui.md',
      'warden.toml',
      'vitest.config.ts',
      'scripts/check.mjs',
      'format.test.ts',
    ]) {
      assert.equal(triage([row(path, 0, 1)]).review, true, path);
    }
    assert.equal(
      triage([{ ...row('docs/old.md'), oldPath: 'auth.ts' }]).review,
      true
    );
  });

  it('does not treat words that merely contain "auth" as risky', () => {
    const verdict = triage([row('apps/web/components/AuthorCard.tsx', 1)]);
    assert.equal(verdict.review, true);
    assert.doesNotMatch(verdict.reason, /risky path/);
  });

  it('parses numstat rows, binaries and renames', () => {
    assert.deepEqual(
      parseNumstat(
        '3\t1\tapps/web/a.ts\n-\t-\tlogo.png\n2\t0\tapps/{old => new}/b.ts\n1\t1\told.ts => new.ts\n'
      ),
      [
        { path: 'apps/web/a.ts', added: 3, deleted: 1 },
        { path: 'logo.png', added: null, deleted: null },
        { path: 'apps/new/b.ts', added: 2, deleted: 0 },
        { path: 'new.ts', added: 1, deleted: 1 },
      ]
    );
  });

  it('CLI exits with SKIP_EXIT for a docs-only staged diff and 0 for code', () => {
    const repo = mkdtempSync(join(tmpdir(), 'jovie-triage-repo-'));
    temporaryDirectories.push(repo);
    const git = args =>
      spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    git(['init', '-q']);
    writeFileSync(join(repo, 'notes.md'), 'hello\n');
    git(['add', 'notes.md']);
    const docs = spawnSync('node', [script, 'staged'], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(docs.status, SKIP_EXIT);
    assert.match(docs.stdout, /^skip: only docs/);

    writeFileSync(
      join(repo, 'app.ts'),
      'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n'
    );
    git(['add', 'app.ts']);
    const code = spawnSync('node', [script, 'staged'], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(code.status, 0);
    assert.match(code.stdout, /^review: 1 code file/);
  });

  it('reviews renamed risk sources and respects the configured comparison branch', () => {
    const repo = mkdtempSync(join(tmpdir(), 'jovie-triage-rename-'));
    temporaryDirectories.push(repo);
    const git = args => {
      const result = spawnSync('git', ['-C', repo, ...args], {
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
    };
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'Hook Test']);
    git(['config', 'user.email', 'hook@example.test']);
    writeFileSync(join(repo, 'auth.ts'), 'risky source\n');
    git(['add', 'auth.ts']);
    git(['commit', '-qm', 'test baseline']);
    git(['branch', 'comparison']);
    git(['mv', 'auth.ts', 'notes.md']);
    const renamed = spawnSync('node', [script, 'staged'], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(renamed.status, 0);
    assert.match(renamed.stdout, /risky path auth.ts/);
    git(['commit', '-qm', 'test rename']);
    writeFileSync(
      join(repo, 'warden.toml'),
      '[defaults]\ndefaultBranch = "comparison"\n'
    );
    const branch = spawnSync('node', [script, 'branch'], {
      cwd: repo,
      encoding: 'utf8',
    });
    assert.equal(branch.status, 0);
    assert.match(branch.stdout, /risky path auth.ts/);
    assert.doesNotMatch(branch.stdout, /triage failed/);
  });

  it('CLI fails open (review) when git cannot answer', () => {
    const outside = mkdtempSync(join(tmpdir(), 'jovie-triage-nogit-'));
    temporaryDirectories.push(outside);
    const result = spawnSync('node', [script, 'branch', 'no-such-ref'], {
      cwd: outside,
      encoding: 'utf8',
      env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() },
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^review: triage failed/);
  });

  it('CLI fails open for an unknown mode', () => {
    const result = spawnSync('node', [script, 'nonsense'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^review: unknown triage mode/);
  });
});
