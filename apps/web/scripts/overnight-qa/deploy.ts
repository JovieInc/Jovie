import {
  assertRepoSuccess,
  OVERNIGHT_BASE_BRANCH,
  runRepoCommand,
} from './repo-git';
import type { DeployWaitResult } from './types';

interface GithubPullRequestView {
  readonly url: string;
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
  }>;
}

function runJsonCommand<T>(command: readonly string[]) {
  const result = runRepoCommand(command);
  assertRepoSuccess(result, `Command failed: ${command.join(' ')}`);
  return JSON.parse(result.stdout) as T;
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
      'url,state,mergeCommit',
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
      OVERNIGHT_BASE_BRANCH,
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
