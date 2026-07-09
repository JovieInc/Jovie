/**
 * GitHub API client for the CI runner autoscaler (HUD module).
 *
 * Uses `gh` CLI via child_process for authenticated API calls.
 * This module runs on gem-linux (not Vercel), where the `gh` CLI is
 * installed and authenticated as @itstimwhite.
 *
 * @see https://docs.github.com/en/rest/actions/self-hosted-runners
 */

import { execFileSync } from 'node:child_process';
import type {
  GitHubJob,
  GitHubRunner,
  GitHubRunnerRegistrationToken,
  GitHubWorkflowRun,
} from './types';

export class GitHubClient {
  private readonly repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  /**
   * Run a `gh api` command and parse JSON output.
   * Matching the shipper's `execFileSync` pattern.
   */
  private ghApi<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: string,
  ): T {
    const args = ['api', endpoint, '--jq', '.'];

    if (method === 'POST') args.push('--method', 'POST');
    else if (method === 'DELETE') args.push('--method', 'DELETE');

    if (body) args.push('--input', '-');

    try {
      const output = execFileSync('gh', args, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30_000,
        ...(body ? { input: body } : {}),
      });
      return JSON.parse(output) as T;
    } catch (err) {
      throw new Error(
        `GitHub API call failed: ${endpoint} — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Fetch runner registration token (valid 1 hour). */
  getRegistrationToken(): GitHubRunnerRegistrationToken {
    return this.ghApi<GitHubRunnerRegistrationToken>(
      `repos/${this.repo}/actions/runners/registration-token`,
      'POST',
    );
  }

  /** List all registered runners for the repo. */
  listRunners(): ReadonlyArray<GitHubRunner> {
    const result = this.ghApi<{ runners: ReadonlyArray<GitHubRunner> }>(
      `repos/${this.repo}/actions/runners`,
    );
    return result.runners;
  }

  /** Remove a runner by ID. */
  removeRunner(runnerId: number): void {
    this.ghApi<void>(
      `repos/${this.repo}/actions/runners/${runnerId}`,
      'DELETE',
    );
  }

  /**
   * Count queued jobs targeting self-hosted runners.
   * Two-step: list queued runs → check each for matching jobs.
   */
  countQueuedJobs(runnerLabel: string): number {
    const result = this.ghApi<{
      total_count: number;
      workflow_runs: ReadonlyArray<GitHubWorkflowRun>;
    }>(`repos/${this.repo}/actions/runs?status=queued&per_page=50`);

    const runs = result.workflow_runs ?? [];
    let jobCount = 0;

    for (const run of runs.slice(0, 10)) {
      try {
        const jobsResult = this.ghApi<{
          total_count: number;
          jobs: ReadonlyArray<GitHubJob>;
        }>(`repos/${this.repo}/actions/runs/${run.id}/jobs?filter=latest`);

        for (const job of jobsResult.jobs) {
          if (
            job.status === 'queued' &&
            job.labels.some((l) => l === runnerLabel || l === 'self-hosted')
          ) {
            jobCount++;
          }
        }
      } catch {
        continue; // skip failed runs
      }
    }

    return jobCount;
  }

  /** Fetch a single job for analysis. */
  getJob(runId: number, jobId: number): GitHubJob | null {
    try {
      return this.ghApi<GitHubJob>(
        `repos/${this.repo}/actions/runs/${runId}/jobs/${jobId}`,
      );
    } catch {
      return null;
    }
  }

  /** List recent completed runs. */
  listRecentRuns(
    event?: string,
    branch?: string,
  ): ReadonlyArray<GitHubWorkflowRun> {
    let endpoint = `repos/${this.repo}/actions/runs?status=completed&per_page=10`;
    if (event) endpoint += `&event=${event}`;
    if (branch) endpoint += `&branch=${branch}`;
    const result = this.ghApi<{
      total_count: number;
      workflow_runs: ReadonlyArray<GitHubWorkflowRun>;
    }>(endpoint);
    return result.workflow_runs ?? [];
  }
}
