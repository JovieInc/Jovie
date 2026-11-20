import { spawnSync } from 'node:child_process';

/**
 * Ref names to try for a diff base (JOV-10351). A bare branch name resolves
 * to its remote-tracking ref first, then the local branch; a name that is
 * already qualified (origin/main, refs/...) is never prefixed again.
 * @returns {string[]}
 */
export function baseRefCandidates(base) {
  const b = base.trim();
  if (/^(?:origin\/|refs\/)/.test(b)) return [b];
  return [`origin/${b}`, b];
}

/**
 * The first candidate that names a commit, or null when none does. Callers
 * must fail on null instead of treating it as 'no changes' (JOV-10351).
 * @returns {string|null}
 */
export function resolveBaseRef(cwd, base) {
  for (const candidate of baseRefCandidates(base))
    if (
      spawnSync(
        'git',
        ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`],
        {
          cwd,
          stdio: 'ignore',
        }
      ).status === 0
    )
      return candidate;
  return null;
}
