// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  collectWorktreeIdentity,
  worktreeDevelopmentEnv,
} from '../../scripts/worktree-identity.mjs';
import {
  assertWorktreeIdentity,
  isLoopbackOrigin,
  parseWorktreeIdentity,
  WORKTREE_IDENTITY_ENV,
  worktreeAttributes,
} from './worktree-identity.mjs';

const root = mkdtempSync(join(tmpdir(), 'jovie-worktree-identity-'));
const repo = join(root, 'repo');
mkdirSync(repo);
const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
git('init', '-q');
writeFileSync(join(repo, 'fixture'), 'initial');
git('add', 'fixture');
git(
  '-c',
  'user.name=Fixture',
  '-c',
  'user.email=fixture@example.invalid',
  '-c',
  'core.hooksPath=/dev/null',
  'commit',
  '-qm',
  'fixture'
);
const second = join(root, 'second');
git('worktree', 'add', '--detach', second, 'HEAD');
const alias = join(root, 'alias');
symlinkSync(repo, alias);
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('worktree attribution boundary', () => {
  it('distinguishes real checkouts at the same head, canonicalizes aliases and renews each boot', () => {
    const first = collectWorktreeIdentity(repo, '3100');
    const other = collectWorktreeIdentity(second, 3101);
    const again = collectWorktreeIdentity(alias, 3100);
    expect(first.head).toBe(other.head);
    expect(first.id).not.toBe(other.id);
    expect(first.id).toBe(again.id);
    expect(first.boot).not.toBe(again.boot);
    expect(JSON.stringify(first)).not.toContain(root);
    expect(parseWorktreeIdentity(JSON.stringify(first))).toEqual(first);
    expect(assertWorktreeIdentity(first, first)).toEqual(first);
    expect(() => assertWorktreeIdentity(first, other)).toThrow(
      'identity mismatch'
    );
    expect(() =>
      assertWorktreeIdentity(first, { ...first, head: 'f'.repeat(40) })
    ).toThrow('identity mismatch');
    expect(() =>
      assertWorktreeIdentity(first, { ...first, port: 3101 })
    ).toThrow('identity mismatch');
    expect(() => assertWorktreeIdentity(first, null)).toThrow(
      'identity mismatch'
    );
    expect(worktreeAttributes(first)).toEqual({
      'jovie.worktree.id': first.id,
      'jovie.worktree.head': first.head,
      'jovie.worktree.boot': first.boot,
    });
    expect(worktreeAttributes(null)).toEqual({});
  });
  it.each([0, 65536, 1.5, 'bad', ''])(
    'rejects invalid port %s before starting an app',
    port => {
      expect(() => collectWorktreeIdentity(repo, port)).toThrow(
        'Invalid worktree app port'
      );
    }
  );
  it('fails if Git cannot attest a checkout', () => {
    expect(() => collectWorktreeIdentity(root, 3100)).toThrow();
  });
  it('replaces inherited identity for local boots and strips it for deployed environments', () => {
    const first = collectWorktreeIdentity(repo, 3100);
    const env = { [WORKTREE_IDENTITY_ENV]: JSON.stringify(first) };
    expect(
      parseWorktreeIdentity(
        worktreeDevelopmentEnv(second, 3101, env)[WORKTREE_IDENTITY_ENV]
      )?.id
    ).not.toBe(first.id);
    for (const deployed of [
      { NODE_ENV: 'production' },
      { VERCEL_ENV: 'preview' },
      { VERCEL_ENV: 'production' },
    ]) {
      expect(
        worktreeDevelopmentEnv('/does-not-exist', 3100, { ...env, ...deployed })
      ).toEqual({ [WORKTREE_IDENTITY_ENV]: '' });
    }
  });
  it('rejects malformed, extra or identifying fields instead of exporting them', () => {
    const valid = collectWorktreeIdentity(repo, 3100);
    for (const value of [
      null,
      undefined,
      '',
      '{',
      [],
      {},
      { ...valid, path: root },
      { ...valid, id: root },
      { ...valid, head: 'short' },
      { ...valid, boot: 'short' },
      { ...valid, port: 0 },
      { ...valid, port: 65536 },
      { ...valid, port: '3100' },
    ])
      expect(parseWorktreeIdentity(value)).toBeNull();
  });
  it.each([
    'http://localhost:3100',
    'http://127.0.0.1:3100',
    'https://[::1]:3100',
  ])('allows loopback %s', url => expect(isLoopbackOrigin(url)).toBe(true));
  it('rejects URL userinfo even on loopback', () => {
    const url = new URL('http://localhost');
    url.username = 'fixture';
    expect(isLoopbackOrigin(url.href)).toBe(false);
    url.username = '';
    url.password = 'fixture';
    expect(isLoopbackOrigin(url.href)).toBe(false);
  });
  it.each([
    'https://jov.ie',
    'http://localhost.evil.test',
    'file://localhost/tmp',
    'bad',
  ])('rejects non-loopback %s', url =>
    expect(isLoopbackOrigin(url)).toBe(false)
  );
});
