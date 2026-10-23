// Bot-only branches must never reach the shared Vercel build queue or Actions.
//
// 2026-10-20: preserving dirty Gem worktrees pushed ~150 backup/gem/* branches
// to LogYourBody. Each one queued a Vercel preview build on the team's shared
// build concurrency, starving Jovie staging until every canary timed out and
// production promotion stalled for hours. An ignoreCommand still enqueues a
// build container per push; git.deploymentEnabled stops Vercel from creating
// the deployment at all. Vercel matches its keys with minimatch, and a branch
// deploys if any matching rule is true, so no rule may re-enable these refs.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterList, workflowTriggers } from '../workflow-triggers.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

// Every Vercel project root in this repo. Path literals also let
// script-contract-affected select this test when only a vercel.json changes.
const VERCEL_CONFIGS = [
  'vercel.json',
  'apps/web/vercel.json',
  'apps/ovie/vercel.json',
  'apps/should-i-make/vercel.json',
  'apps/docs/vercel.json',
];

const EXCLUDED_PREFIXES = ['backup', 'archive', 'stash', 'gh-readonly-queue'];
const SAMPLE_REFS = EXCLUDED_PREFIXES.map(
  prefix => `${prefix}/gem/run-20261020/codex_some-lane`
);

// minimatch / GitHub filter semantics for the patterns used here: `**` spans
// slashes, `*` and `?` stay inside one segment.
function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      source += '.*';
      i++;
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${source}$`, 'u');
}
const matches = (glob, ref) => globToRegExp(glob).test(ref);

function vercelDeploys(config, ref) {
  const enabled = config.git?.deploymentEnabled;
  if (enabled === undefined) return true;
  if (typeof enabled === 'boolean') return enabled;
  const rules = Object.entries(enabled).filter(([glob]) => matches(glob, ref));
  if (rules.length === 0) return true;
  return rules.some(([, value]) => value === true);
}

describe('vercel branch exclusions', () => {
  it('matches globs the way Vercel and Actions do', () => {
    expect(matches('backup/**', 'backup/gem/a/b')).toBe(true);
    expect(matches('backup/*', 'backup/gem/a')).toBe(false);
    expect(matches('backup/**', 'backups/x')).toBe(false);
    expect(
      vercelDeploys(
        { git: { deploymentEnabled: { 'backup/**': false, '**': true } } },
        'backup/x'
      )
    ).toBe(true);
  });

  it.each(VERCEL_CONFIGS)('%s never deploys bot-only refs', file => {
    const config = JSON.parse(readFileSync(resolve(repoRoot, file), 'utf8'));
    for (const prefix of EXCLUDED_PREFIXES) {
      expect(config.git?.deploymentEnabled?.[`${prefix}/**`]).toBe(false);
    }
    for (const ref of SAMPLE_REFS)
      expect(vercelDeploys(config, ref)).toBe(false);
    expect(vercelDeploys(config, 'main')).toBe(true);
  });

  it('runs no workflow on a push or creation of a bot-only ref', () => {
    const dir = resolve(repoRoot, '.github/workflows');
    const offenders = [];
    for (const name of readdirSync(dir).filter(n => /\.ya?ml$/u.test(n))) {
      const on = workflowTriggers(readFileSync(resolve(dir, name), 'utf8'));
      if ('create' in on) offenders.push(`${name}: create`);
      if (!('push' in on)) continue;
      const branches = filterList(on.push.branches);
      const ignored = filterList(on.push['branches-ignore']);
      const tagsOnly =
        branches.length === 0 && ignored.length === 0 && 'tags' in on.push;
      for (const ref of SAMPLE_REFS) {
        const runs =
          !tagsOnly &&
          (branches.length > 0
            ? branches.some(glob => !glob.startsWith('!') && matches(glob, ref))
            : !ignored.some(glob => matches(glob, ref)));
        if (runs) offenders.push(`${name}: push ${ref}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
