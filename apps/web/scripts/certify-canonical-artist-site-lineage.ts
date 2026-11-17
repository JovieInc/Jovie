#!/usr/bin/env tsx
/**
 * Git-path lineage binding for the canonical artist-site certification
 * (JOV-12646): binds the deployed revision to the certified source from the
 * local checkout so certification does not depend on the commits REST API,
 * whose installation quota emptied the workflow's lineage file and failed
 * whole GP (manual) pushes. `unanswered` means git could not answer and the
 * commits-API lineage file decides instead; a genuinely unrelated pair of
 * locally-present commits is real drift, never `unanswered`.
 */
import { execFileSync } from 'node:child_process';

const COMMIT_SHA = /^[a-f0-9]{40}$/;

export type GitRun = (
  file: string,
  args: readonly string[],
  cwd: string
) => { readonly status: number; readonly stdout: string };

/** Non-throwing git invocation: exit status plus captured stdout. */
export const runGit: GitRun = (file, args, cwd) => {
  try {
    return {
      status: 0,
      stdout: execFileSync(file, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString(),
    };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: Buffer };
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? err.stdout.toString() : '',
    };
  }
};

/** True when the checkout holds the commit object (local read, no network). */
export function gitRevisionExists(
  repoRoot: string,
  revision: string,
  run: GitRun = runGit
): boolean {
  if (!COMMIT_SHA.test(revision.trim().toLowerCase())) return false;
  return (
    run(
      'git',
      ['rev-parse', '--verify', '--quiet', `${revision}^{commit}`],
      repoRoot
    ).status === 0
  );
}

/** The checkout root containing the working directory, when it is a repo. */
export function resolveGitRoot(
  startDirectory: string,
  run: GitRun = runGit
): string | null {
  const result = run('git', ['rev-parse', '--show-toplevel'], startDirectory);
  const root = result.stdout.trim();
  return result.status === 0 && root.length > 0 ? root : null;
}

export type GitLineageBinding = 'same' | 'ancestor' | 'unrelated';

/**
 * Bind the deployed revision to the certified source from the local checkout.
 * `git merge-base --is-ancestor` is only trusted when the checkout can see
 * the connecting history: a shallow checkout is unshallowed first
 * (blob-filtered, so it is commits and trees only), and the deployed commit
 * is fetched by SHA when it is missing locally. `unanswered` means git could
 * not answer and the commits-API lineage file decides instead.
 */
export function classifyDeployedRevisionFromGit(
  repoRoot: string,
  sourceRevision: string,
  deployedRevision: string | null | undefined,
  run: GitRun = runGit
): GitLineageBinding | 'unanswered' {
  const source = sourceRevision.trim().toLowerCase();
  const deployed = deployedRevision?.trim().toLowerCase() ?? '';
  if (!COMMIT_SHA.test(source) || !COMMIT_SHA.test(deployed))
    return 'unanswered';
  // The certified source is this checkout's own revision; when it is not
  // present locally there is no binding to do from git at all.
  if (!gitRevisionExists(repoRoot, source, run)) return 'unanswered';
  if (source === deployed) return 'same';
  if (!gitRevisionExists(repoRoot, deployed, run)) {
    // Materialize the deployed commit: unshallow a shallow checkout, or fetch
    // the exact commit by SHA (blob-filtered; ancestry needs only commits and
    // trees). A failed fetch is unanswered, not unrelated.
    const shallow = run(
      'git',
      ['rev-parse', '--is-shallow-repository'],
      repoRoot
    );
    if (shallow.stdout.trim() === 'true') {
      run(
        'git',
        ['fetch', '--no-tags', '--filter=blob:none', '--unshallow', 'origin'],
        repoRoot
      );
    } else {
      run(
        'git',
        ['fetch', '--no-tags', '--filter=blob:none', 'origin', deployed],
        repoRoot
      );
    }
    if (!gitRevisionExists(repoRoot, deployed, run)) return 'unanswered';
  }
  const ancestor = run(
    'git',
    ['merge-base', '--is-ancestor', deployed, source],
    repoRoot
  );
  if (ancestor.status === 0) return 'ancestor';
  if (ancestor.status === 1) return 'unrelated';
  return 'unanswered';
}
