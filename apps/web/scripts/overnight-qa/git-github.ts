import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { repoRoot } from './ledger';
import { countTotalDiffLines } from './risk';
import type {
  CommandExecutionResult,
  DeployWaitResult,
  PullRequestInfo,
} from './types';

const REPO_ROOT = repoRoot();
const BASE_BRANCH = 'main';

interface GithubPullRequestView {
  readonly number: number;
  readonly url: string;
  readonly title: string;
  readonly state: string;
  readonly mergeCommit?: {
    readonly oid?: string;
  } | null;
}

interface GithubRun {
  readonly databaseId: number;
  readonly headSha: string;
  readonly status: string;
  readonly conclusion?: string | null;
  readonly workflowName?: string | null;
  readonly name?: string | null;
}

interface GithubRunView {
  readonly jobs?: ReadonlyArray<{
    readonly name?: string;
    readonly conclusion?: string | null;
    readonly status?: string | null;
  }>;
}

export function runRepoCommand(
  command: readonly string[],
  options: {
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string>>;
  } = {}
): CommandExecutionResult {
  const [binary, ...args] = command;
  const result = spawnSync(binary, args, {
    cwd: options.cwd ?? REPO_ROOT,
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

function assertSuccess(result: CommandExecutionResult, context: string) {
  if (result.code === 0) {
    return;
  }

  throw new Error(
    [context, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join('\n')
  );
}

function runJsonCommand<T>(command: readonly string[]) {
  const result = runRepoCommand(command);
  assertSuccess(result, `Command failed: ${command.join(' ')}`);
  return JSON.parse(result.stdout) as T;
}

export function assertPreflightClean() {
  assertSuccess(
    runRepoCommand(['gh', 'auth', 'status']),
    'GitHub auth is not ready.'
  );
  assertSuccess(
    runRepoCommand(['doppler', '--version']),
    'Doppler CLI is not available.'
  );

  const status = runRepoCommand(['git', 'status', '--short']);
  assertSuccess(status, 'Unable to read git status.');
  if (status.stdout.trim()) {
    throw new Error(
      'Overnight QA requires a clean working tree before starting.'
    );
  }
}

export function prepareBaseBranch() {
  assertSuccess(
    runRepoCommand(['git', 'fetch', 'origin', BASE_BRANCH]),
    'Failed to fetch the base branch.'
  );
  assertSuccess(
    runRepoCommand(['git', 'checkout', BASE_BRANCH]),
    `Failed to checkout ${BASE_BRANCH}.`
  );
  assertSuccess(
    runRepoCommand(['git', 'pull', '--ff-only', 'origin', BASE_BRANCH]),
    `Failed to fast-forward ${BASE_BRANCH}.`
  );
}

export function checkoutFixBranch(branchName: string) {
  assertSuccess(
    runRepoCommand([
      'git',
      'checkout',
      '-B',
      branchName,
      `origin/${BASE_BRANCH}`,
    ]),
    `Failed to create ${branchName} from origin/${BASE_BRANCH}.`
  );
}

export function currentBranch() {
  const result = runRepoCommand(['git', 'branch', '--show-current']);
  assertSuccess(result, 'Unable to determine current branch.');
  return result.stdout.trim();
}

export function getChangedFilesAgainstMain() {
  const result = runRepoCommand([
    'git',
    'diff',
    '--name-only',
    `origin/${BASE_BRANCH}...HEAD`,
  ]);
  assertSuccess(result, 'Unable to determine changed files.');
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
    `origin/${BASE_BRANCH}...HEAD`,
  ]);
  assertSuccess(result, 'Unable to determine diff stats.');
  return {
    totalDiffLines: countTotalDiffLines(result.stdout),
    changedFiles: getChangedFilesAgainstMain(),
  };
}

export function commitAll(message: string) {
  assertSuccess(
    runRepoCommand(['git', 'add', '-A']),
    'Failed to stage changes.'
  );
  const staged = runRepoCommand(['git', 'diff', '--cached', '--name-only']);
  assertSuccess(staged, 'Unable to inspect staged changes.');
  if (!staged.stdout.trim()) {
    throw new Error('No changes were staged for commit.');
  }

  assertSuccess(
    runRepoCommand(['git', 'commit', '-m', message]),
    'Failed to commit changes.'
  );
}

export function pushCurrentBranch() {
  const branchName = currentBranch();
  const result = runRepoCommand(['git', 'push', '-u', 'origin', branchName]);
  assertSuccess(result, `Failed to push ${branchName}.`);
}

export function findOpenPrForCurrentBranch() {
  const result = runRepoCommand([
    'gh',
    'pr',
    'view',
    '--json',
    'number,url,title,state',
  ]);

  if (result.code !== 0) {
    return null;
  }

  const view = JSON.parse(result.stdout) as GithubPullRequestView;
  if (view.state !== 'OPEN') {
    return null;
  }

  return {
    number: view.number,
    url: view.url,
    title: view.title,
    branch: currentBranch(),
  } satisfies PullRequestInfo;
}

export function ensureDraftPr(params: {
  readonly title: string;
  readonly body: string;
}): PullRequestInfo {
  const existing = findOpenPrForCurrentBranch();
  if (existing) {
    assertSuccess(
      runRepoCommand([
        'gh',
        'pr',
        'edit',
        String(existing.number),
        '--title',
        params.title,
        '--body',
        params.body,
      ]),
      `Failed to update PR #${existing.number}.`
    );
    return {
      ...existing,
      title: params.title,
    };
  }

  const create = runRepoCommand([
    'gh',
    'pr',
    'create',
    '--draft',
    '--base',
    BASE_BRANCH,
    '--title',
    params.title,
    '--body',
    params.body,
  ]);
  assertSuccess(create, 'Failed to create draft PR.');

  const match = create.stdout.trim().match(/https:\/\/github\.com\/\S+/);
  const createdUrl = match?.[0] ?? '';
  const created = findOpenPrForCurrentBranch();
  if (!created) {
    throw new Error(
      `PR was created but could not be reloaded. URL: ${createdUrl}`
    );
  }

  return created;
}

export function applyLabels(prNumber: number, labels: readonly string[]) {
  if (labels.length === 0) {
    return;
  }

  assertSuccess(
    runRepoCommand([
      'gh',
      'pr',
      'edit',
      String(prNumber),
      '--add-label',
      labels.join(','),
    ]),
    `Failed to apply labels to PR #${prNumber}.`
  );
}

export function enableAutoMerge(prNumber: number) {
  assertSuccess(
    runRepoCommand([
      'gh',
      'pr',
      'merge',
      String(prNumber),
      '--auto',
      '--squash',
      '--delete-branch',
    ]),
    `Failed to enable auto-merge for PR #${prNumber}.`
  );
}

export async function waitForPrMerge(
  prNumber: number,
  timeoutMs = 30 * 60_000
): Promise<{ url: string; mergeSha: string }> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const view = runJsonCommand<GithubPullRequestView>([
      'gh',
      'pr',
      'view',
      String(prNumber),
      '--json',
      'number,url,title,state,mergeCommit',
    ]);

    if (view.state === 'MERGED' && view.mergeCommit?.oid) {
      return {
        url: view.url,
        mergeSha: view.mergeCommit.oid,
      };
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 30_000));
  }

  throw new Error(`Timed out waiting for PR #${prNumber} to merge.`);
}

function findDeployRun(runs: readonly GithubRun[], mergeSha: string) {
  return runs.find(run => {
    const workflowName = (run.workflowName ?? run.name ?? '').toLowerCase();
    return (
      run.headSha === mergeSha &&
      (workflowName.includes('ci') || workflowName.includes('deploy'))
    );
  });
}

export async function waitForDeployVerification(
  mergeSha: string,
  timeoutMs = 45 * 60_000
): Promise<DeployWaitResult> {
  const startedAt = Date.now();
  let workflowName: string | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const runs = runJsonCommand<readonly GithubRun[]>([
      'gh',
      'run',
      'list',
      '--branch',
      BASE_BRANCH,
      '--limit',
      '30',
      '--json',
      'databaseId,headSha,status,conclusion,workflowName,name',
    ]);

    const matchingRun = findDeployRun(runs, mergeSha);
    if (!matchingRun) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 20_000));
      continue;
    }

    workflowName = matchingRun.workflowName ?? matchingRun.name ?? null;
    if (matchingRun.status !== 'completed') {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 20_000));
      continue;
    }

    const runView = runJsonCommand<GithubRunView>([
      'gh',
      'run',
      'view',
      String(matchingRun.databaseId),
      '--json',
      'jobs',
    ]);

    const failedJobs =
      runView.jobs
        ?.filter(job => job.conclusion === 'failure')
        .map(job => job.name ?? 'unknown job') ?? [];

    const blockingJobFailure = failedJobs.filter(jobName => {
      const lowerName = jobName.toLowerCase();
      return (
        lowerName.includes('deploy') ||
        lowerName.includes('canary') ||
        lowerName.includes('sentry')
      );
    });

    if (
      matchingRun.conclusion === 'success' &&
      blockingJobFailure.length === 0
    ) {
      return {
        status: 'passed',
        mergeSha,
        workflowName,
        failedJobs: [],
      };
    }

    return {
      status: 'failed',
      mergeSha,
      workflowName,
      failedJobs:
        blockingJobFailure.length > 0 ? blockingJobFailure : failedJobs,
    };
  }

  return {
    status: 'timed_out',
    mergeSha,
    workflowName,
    failedJobs: [],
  };
}

export function buildPrBody(params: {
  readonly issueSummary: string;
  readonly evidencePaths: readonly string[];
  readonly verificationLabels: readonly string[];
  readonly riskReasons: readonly string[];
}) {
  return [
    '## Summary',
    params.issueSummary,
    '',
    '## Evidence',
    ...(params.evidencePaths.length > 0
      ? params.evidencePaths.map(path => `- ${path}`)
      : ['- No local evidence files were recorded.']),
    '',
    '## Verification',
    ...(params.verificationLabels.length > 0
      ? params.verificationLabels.map(label => `- ${label}`)
      : ['- Verification pending']),
    '',
    '## Risk Notes',
    ...(params.riskReasons.length > 0
      ? params.riskReasons.map(reason => `- ${reason}`)
      : ['- No additional risk notes.']),
  ].join('\n');
}

export function branchSlug(baseName: string) {
  return baseName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function controllerRepoRoot() {
  return REPO_ROOT;
}

export function reportPathFromRepoRoot(relativePath: string) {
  return resolve(REPO_ROOT, relativePath);
}
