/** Trusted ci-fast base for JOV-5447. Never falls back to HEAD. */
import { spawnSync } from 'node:child_process';
export function gitRefExists(repoRoot, ref) {
  if (typeof ref !== 'string' || ref.trim() === '') return false;
  const result = spawnSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  return result.status === 0;
}
export function gitShowText(repoRoot, ref, relativePath) {
  const result = spawnSync('git', ['show', `${ref}:${relativePath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

/** Candidate refs in ci-fast source-context order. Never includes HEAD. */
export function ciFastTrustedBaseCandidates(env = process.env) {
  const event = env.GITHUB_EVENT_NAME || '';
  const namedBase = env.GITHUB_BASE_REF || 'main';
  const originBase = `origin/${namedBase}`;
  const turbo = env.TURBO_SCM_BASE;
  /** @type {string[]} */
  const candidates = [];
  const push = value => {
    if (
      typeof value === 'string' &&
      value.trim() &&
      !candidates.includes(value)
    ) {
      candidates.push(value);
    }
  };

  if (event === 'pull_request' || event === 'merge_group') {
    push(originBase);
    push(turbo);
  } else {
    push(turbo);
    push(originBase);
  }
  return candidates;
}

/**
 * @param {{
 *   repoRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 *   refExists?: (ref: string) => boolean,
 * }} [options]
 * @returns {{ ok: true, ref: string } | { ok: false, ref: null, detail: string }}
 */
export function resolveCiFastTrustedBase(options = {}) {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? process.cwd();
  const candidates = ciFastTrustedBaseCandidates(env);
  const refExists = options.refExists ?? (ref => gitRefExists(repoRoot, ref));

  if (candidates.length === 0) {
    return {
      ok: false,
      ref: null,
      detail:
        'trusted base is missing: ci-fast source context has no GITHUB_BASE_REF or TURBO_SCM_BASE',
    };
  }

  for (const ref of candidates) {
    if (refExists(ref)) return { ok: true, ref };
  }

  return {
    ok: false,
    ref: null,
    detail: `trusted base is missing (tried ${candidates.join(', ')})`,
  };
}
