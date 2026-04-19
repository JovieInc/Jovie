import { spawnSync } from 'node:child_process';
import { OVERNIGHT_REPO_ROOT } from './paths';
import { countTotalDiffLines } from './risk';
import type { CommandExecutionResult } from './types';

export const OVERNIGHT_BASE_BRANCH = 'main';

export function runRepoCommand(
  command: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  } = {}
): CommandExecutionResult {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? OVERNIGHT_REPO_ROOT,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function assertRepoSuccess(
  result: CommandExecutionResult,
  context: string
) {
  if (result.code === 0) {
    return;
  }

  throw new Error(
    [context, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join('\n')
  );
}

function isWorktreeClaimError(result: CommandExecutionResult) {
  const combinedOutput = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return (
    combinedOutput.includes('already used by worktree') &&
    combinedOutput.includes(OVERNIGHT_BASE_BRANCH)
  );
}

export function assertPreflightClean() {
  assertRepoSuccess(
    runRepoCommand(['gh', 'auth', 'status']),
    'GitHub auth is not ready.'
  );
  assertRepoSuccess(
    runRepoCommand(['doppler', '--version']),
    'Doppler CLI is not available.'
  );

  const status = runRepoCommand(['git', 'status', '--short']);
  assertRepoSuccess(status, 'Unable to read git status.');
  if (status.stdout.trim()) {
    throw new Error(
      'Overnight QA requires a clean working tree before starting.'
    );
  }
}

export function prepareBaseBranch(
  runCommand: typeof runRepoCommand = runRepoCommand
) {
  assertRepoSuccess(
    runCommand(['git', 'fetch', 'origin', OVERNIGHT_BASE_BRANCH]),
    'Failed to fetch the base branch.'
  );
  const checkoutBaseBranch = runCommand([
    'git',
    'checkout',
    OVERNIGHT_BASE_BRANCH,
  ]);
  if (checkoutBaseBranch.code !== 0) {
    if (!isWorktreeClaimError(checkoutBaseBranch)) {
      assertRepoSuccess(
        checkoutBaseBranch,
        `Failed to checkout ${OVERNIGHT_BASE_BRANCH}.`
      );
    }

    assertRepoSuccess(
      runCommand([
        'git',
        'checkout',
        '--detach',
        `origin/${OVERNIGHT_BASE_BRANCH}`,
      ]),
      `Failed to detach onto origin/${OVERNIGHT_BASE_BRANCH}.`
    );
    return;
  }

  assertRepoSuccess(
    runCommand(['git', 'pull', '--ff-only', 'origin', OVERNIGHT_BASE_BRANCH]),
    `Failed to fast-forward ${OVERNIGHT_BASE_BRANCH}.`
  );
}

export function checkoutFixBranch(branchName: string) {
  assertRepoSuccess(
    runRepoCommand([
      'git',
      'checkout',
      '-B',
      branchName,
      `origin/${OVERNIGHT_BASE_BRANCH}`,
    ]),
    `Failed to create ${branchName} from origin/${OVERNIGHT_BASE_BRANCH}.`
  );
}

export function currentBranch() {
  const result = runRepoCommand(['git', 'branch', '--show-current']);
  assertRepoSuccess(result, 'Unable to determine current branch.');
  return result.stdout.trim();
}

export function getChangedFilesAgainstMain() {
  const result = runRepoCommand([
    'git',
    'diff',
    '--name-only',
    `origin/${OVERNIGHT_BASE_BRANCH}...HEAD`,
  ]);
  assertRepoSuccess(result, 'Unable to determine changed files.');
  return result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export function getDiffStatsAgainstMain() {
  const result = runRepoCommand([
    'git',
    'diff',
    '--numstat',
    `origin/${OVERNIGHT_BASE_BRANCH}...HEAD`,
  ]);
  assertRepoSuccess(result, 'Unable to determine diff stats.');
  return {
    totalDiffLines: countTotalDiffLines(result.stdout),
    changedFiles: getChangedFilesAgainstMain(),
  };
}

export function commitAll(message: string) {
  assertRepoSuccess(
    runRepoCommand(['git', 'add', '-A']),
    'Failed to stage changes.'
  );
  const staged = runRepoCommand(['git', 'diff', '--cached', '--name-only']);
  assertRepoSuccess(staged, 'Unable to inspect staged changes.');
  if (!staged.stdout.trim()) {
    throw new Error('No changes were staged for commit.');
  }

  assertRepoSuccess(
    runRepoCommand(['git', 'commit', '-m', message]),
    'Failed to commit changes.'
  );
}

export function pushCurrentBranch() {
  const branchName = currentBranch();
  const result = runRepoCommand(['git', 'push', '-u', 'origin', branchName]);
  assertRepoSuccess(result, `Failed to push ${branchName}.`);
}

export function branchSlug(baseName: string) {
  return baseName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function controllerRepoRoot() {
  return OVERNIGHT_REPO_ROOT;
}
