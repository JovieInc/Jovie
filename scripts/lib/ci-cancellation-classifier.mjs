#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FIXED_RUNNER_SETUP_CANCELLATION =
  'fixed_runner_setup_broker_overlap';

function isNewerRunForSameHead(candidate, sourceRun) {
  if (
    candidate?.id === sourceRun.id ||
    candidate?.workflow_id !== sourceRun.workflow_id ||
    candidate?.head_sha !== sourceRun.head_sha
  ) {
    return false;
  }

  if (
    Number.isInteger(candidate.run_number) &&
    Number.isInteger(sourceRun.run_number)
  ) {
    return candidate.run_number > sourceRun.run_number;
  }

  const candidateCreatedAt = Date.parse(candidate.created_at ?? '');
  const sourceCreatedAt = Date.parse(sourceRun.created_at ?? '');
  return (
    Number.isFinite(candidateCreatedAt) &&
    Number.isFinite(sourceCreatedAt) &&
    candidateCreatedAt > sourceCreatedAt
  );
}

function reject(reason, diagnostics = {}) {
  return {
    retryable: false,
    action: 'diagnose_only',
    classification: 'not_retryable',
    reason,
    diagnostics,
  };
}

/**
 * Classify the one narrow GitHub Actions cancellation that is safe to retry.
 * Every ambiguous or stale shape fails closed.
 */
export function classifyCiCancellation(input) {
  const run = input?.run;
  const jobs = Array.isArray(input?.jobs) ? input.jobs : [];
  const livePr = input?.livePr;
  const recentRuns = Array.isArray(input?.recentRuns) ? input.recentRuns : [];

  if (run?.name !== 'CI') {
    return reject('source_workflow_not_ci');
  }
  if (run.status !== 'completed' || run.conclusion !== 'cancelled') {
    return reject('source_run_not_completed_cancelled');
  }
  if (run.run_attempt !== 1) {
    return reject('source_run_already_retried', {
      runAttempt: run.run_attempt ?? null,
    });
  }
  if (livePr?.state !== 'open' || !livePr?.number) {
    return reject('no_live_open_pr');
  }
  if (livePr?.head?.sha !== run.head_sha) {
    return reject('pr_head_moved', {
      sourceHeadSha: run.head_sha ?? null,
      liveHeadSha: livePr?.head?.sha ?? null,
    });
  }
  if (recentRuns.some(candidate => isNewerRunForSameHead(candidate, run))) {
    return reject('newer_ci_run_same_head');
  }

  const cancelledJobs = jobs.filter(job => job?.conclusion === 'cancelled');
  if (cancelledJobs.length !== 1) {
    return reject('cancelled_job_count_not_one', {
      cancelledJobCount: cancelledJobs.length,
    });
  }

  const job = cancelledJobs[0];
  const labels = Array.isArray(job.labels) ? job.labels : [];
  if (!labels.includes('jovie-fixed')) {
    return reject('cancelled_job_not_fixed_runner', {
      jobId: job.id ?? null,
      labels,
    });
  }
  if (!job.runner_id || !job.runner_name) {
    return reject('cancelled_job_missing_runner_identity', {
      jobId: job.id ?? null,
    });
  }

  const steps = Array.isArray(job.steps) ? job.steps : [];
  const setupStep = steps[0];
  if (
    steps.length !== 1 ||
    setupStep?.name !== 'Set up job' ||
    setupStep?.conclusion !== 'cancelled'
  ) {
    return reject('cancelled_job_not_setup_only', {
      jobId: job.id ?? null,
      stepNames: steps.map(step => step?.name ?? ''),
    });
  }

  return {
    retryable: true,
    action: 'rerun_failed_jobs',
    classification: FIXED_RUNNER_SETUP_CANCELLATION,
    reason: 'fixed_runner_cancelled_during_setup_before_test_execution',
    diagnostics: {
      sourceRunId: run.id,
      sourceRunAttempt: run.run_attempt,
      sourceHeadSha: run.head_sha,
      prNumber: livePr.number,
      jobId: job.id,
      jobName: job.name,
      runnerId: job.runner_id,
      runnerName: job.runner_name,
      runnerLabels: labels,
      startedAt: job.started_at ?? null,
      completedAt: job.completed_at ?? null,
      testsExecuted: false,
      runnerExitCode: 'unavailable_via_github_api',
    },
  };
}

function main() {
  const inputIndex = process.argv.indexOf('--input');
  const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
  if (!inputPath) {
    console.error('Usage: ci-cancellation-classifier.mjs --input <json-file>');
    process.exitCode = 2;
    return;
  }

  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(classifyCiCancellation(input))}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
