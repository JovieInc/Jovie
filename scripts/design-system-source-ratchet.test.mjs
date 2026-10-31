import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { evaluateBaseDesignRatchet } from './design-system-base-ratchet.mjs';
import {
  RAW_HEX_PATTERN,
  RAW_PALETTE_PATTERN,
} from './design-system-source-ratchet.mjs';

const all = (source, pattern) =>
  source.match(new RegExp(pattern.source, pattern.flags)) ?? [];

test('raw hex rule catches 6/8 digit literals, not token refs or short ids', () => {
  assert.deepEqual(all('color: "#FFFFFF", b: "#00000000"', RAW_HEX_PATTERN), [
    '#FFFFFF',
    '#00000000',
  ]);
  assert.deepEqual(all('href="#section" var(--color-bg)', RAW_HEX_PATTERN), []);
});

test('raw palette rule catches palette families, leaves semantic tokens and white/black to eslint', () => {
  assert.deepEqual(
    all(
      'bg-amber-500 text-emerald-300 border-rose-500/40',
      RAW_PALETTE_PATTERN
    ),
    ['bg-amber-500', 'text-emerald-300', 'border-rose-500']
  );
  assert.deepEqual(
    all(
      'text-primary-token bg-surface-1 text-white bg-black',
      RAW_PALETTE_PATTERN
    ),
    []
  );
});

function fixture(t) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'design-base-ratchet-'));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
  const write = (path, source) => {
    mkdirSync(dirname(join(repoRoot, path)), { recursive: true });
    writeFileSync(join(repoRoot, path), source);
  };
  git('init', '--quiet');
  write('apps/web/app/page.tsx', 'const color = "#112233 bg-amber-500";');
  write('apps/web/components/a/Badge.tsx', 'export const Badge = 1;');
  write('packages/ui/Badge.tsx', 'export const Badge = 2;');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'base'
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return { repoRoot, git, write };
}

test('uses base source debt without expanding committed allowances; shrink passes', t => {
  const { repoRoot, write } = fixture(t);
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, true);
  write('apps/web/app/page.tsx', 'const color = "var(--color-bg)";');
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, true);
});

test('rejects new raw identities and an extra fork of an already duplicated component', t => {
  const { repoRoot, write } = fixture(t);
  write('apps/web/app/page.tsx', 'const color = "#445566 text-rose-500";');
  write('apps/web/components/b/Badge.tsx', 'export const Badge = 3;');
  const result = evaluateBaseDesignRatchet({ repoRoot });
  assert.equal(result.ok, false);
  assert.deepEqual(result.newIdentities, [
    'apps/web/app/page.tsx\traw-hex-color\t#445566',
    'apps/web/app/page.tsx\traw-palette-class\ttext-rose-500',
    'apps/web/components/b/Badge.tsx\tduplicate-component\tBadge',
  ]);
});

test('locks in landed removals and does not grandfather feature-branch debt', t => {
  const { repoRoot, git, write } = fixture(t);
  write('apps/web/app/page.tsx', 'const color = "var(--color-bg)";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'shrink'
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  write('apps/web/app/page.tsx', 'const color = "#112233";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'regrow'
  );
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, false);
});

test('fails closed if the trusted base is missing', t => {
  const { repoRoot } = fixture(t);
  assert.throws(
    () => evaluateBaseDesignRatchet({ repoRoot, baseRef: 'missing' }),
    /trusted design base/
  );
});

test('uses the target tip to reject regrowth on a stale feature branch', t => {
  const { repoRoot, git, write } = fixture(t);
  git('branch', 'feature');
  write('apps/web/app/page.tsx', 'const color = "var(--color-bg)";');
  git('add', '.');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--quiet',
    '-m',
    'landed shrink'
  );
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  git('checkout', '--quiet', 'feature');
  assert.equal(evaluateBaseDesignRatchet({ repoRoot }).ok, false);
});
