import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { WORKTREE_IDENTITY_ENV } from '../lib/observability/worktree-identity.mjs';

/** No raw paths, branches, credentials or user data enter telemetry. */
/** @param {string} cwd @param {string | number} port */
export function collectWorktreeIdentity(cwd, port) {
  const numericPort = Number(port);
  if (
    !Number.isInteger(numericPort) ||
    numericPort < 1 ||
    numericPort > 65535
  ) {
    throw new Error('Invalid worktree app port');
  }
  /** @param {string[]} args */
  const git = args =>
    execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 }).trim();
  const root = realpathSync(git(['rev-parse', '--show-toplevel']));
  const head = git(['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40}$/.test(head))
    throw new Error('Invalid worktree Git head');
  return {
    id: `wt_${createHash('sha256').update(root).digest('hex').slice(0, 24)}`,
    head,
    boot: randomBytes(16).toString('hex'),
    port: numericPort,
  };
}

/** Called only by the existing dev launcher, never during ordinary app requests. */
/** @param {string} cwd @param {string | number} port @param {Record<string, string | undefined>} env */
export function worktreeDevelopmentEnv(cwd, port, env) {
  if (
    env.NODE_ENV === 'production' ||
    ['preview', 'production'].includes(env.VERCEL_ENV ?? '')
  ) {
    return { [WORKTREE_IDENTITY_ENV]: '' };
  }
  return {
    [WORKTREE_IDENTITY_ENV]: JSON.stringify(collectWorktreeIdentity(cwd, port)),
  };
}
