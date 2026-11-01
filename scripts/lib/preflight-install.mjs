/**
 * Install-provenance guard for `pnpm preflight:changed`. A worktree that reuses
 * another checkout's `node_modules` (to save disk) runs checks against code it
 * did not install: the root and `apps/web` trees can come from different
 * installs, and both can be stale against this branch's lockfile. Such runs
 * fail in confusing ways (duplicate React, missing workspace packages) that
 * look like code defects. This module refuses them up front.
 *
 * Rules: both `node_modules` trees exist; each install's copied lockfile
 * (`node_modules/.pnpm/lock.yaml`, written by pnpm on install) is byte-identical
 * to `pnpm-lock.yaml`; and both trees resolve into this repo's own root.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

export const INSTALL_FIX =
  'run `pnpm install --frozen-lockfile --prefer-offline` in this worktree';

const sha = text => createHash('sha256').update(text).digest('hex');

/**
 * @param {{repo: string}} input absolute repo root
 * @returns {{ok: boolean, problems: string[], message: string}}
 */
export function checkInstallMatchesLockfile({ repo }) {
  const problems = [];
  const lockPath = path.join(repo, 'pnpm-lock.yaml');
  if (!existsSync(lockPath))
    return {
      ok: false,
      problems: ['no pnpm-lock.yaml in this repo'],
      message: '',
    };
  const lock = readFileSync(lockPath, 'utf8');
  const trees = [
    ['root', path.join(repo, 'node_modules')],
    ['apps/web', path.join(repo, 'apps/web/node_modules')],
  ];
  const owners = [];
  for (const [label, dir] of trees) {
    if (!existsSync(dir)) {
      problems.push(`${label} node_modules is missing`);
      continue;
    }
    const installed = path.join(dir, '.pnpm', 'lock.yaml');
    if (label === 'root') {
      if (!existsSync(installed))
        problems.push('root node_modules has no installed lockfile copy');
      else if (sha(readFileSync(installed, 'utf8')) !== sha(lock))
        problems.push(
          'root node_modules was installed from a different lockfile'
        );
    }
    // The owner of a tree is the checkout its realpath lives in: the root tree
    // sits at <owner>/node_modules, apps/web's at <owner>/apps/web/node_modules.
    const real = realpathSync(dir);
    const owner =
      label === 'root' ? path.dirname(real) : path.resolve(real, '../../..');
    owners.push([label, owner]);
  }
  const ownRoot = realpathSync(repo);
  for (const [label, owner] of owners)
    if (owner !== ownRoot)
      problems.push(
        `${label} node_modules resolves into ${owner}, not this worktree`
      );
  const message = problems.length
    ? `node_modules is from a different install: ${problems.join('; ')}. Fix: ${INSTALL_FIX}.`
    : '';
  return { ok: problems.length === 0, problems, message };
}
