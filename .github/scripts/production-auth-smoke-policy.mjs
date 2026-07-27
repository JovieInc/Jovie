#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONTROLLER_PATH = '.github/workflows/production-controller.yml';
const REQUIRED_PASSING_JOBS = [
  'Production Release / Production release result',
  'Post-Deploy Smoke (Production)',
  'Post-Deploy Auth Smoke (Production)',
  'Lighthouse CI (Production)',
  'Production Verified',
];

function positiveInteger(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function completedJob(jobs, name) {
  const matches = jobs.filter(job => job?.name === name);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${name} job`);
  }
  const [job] = matches;
  if (
    positiveInteger(job.id) === null ||
    job.status !== 'completed' ||
    typeof job.conclusion !== 'string'
  ) {
    throw new Error(`Malformed ${name} job evidence`);
  }
  return job;
}

export function validateProductionAuthSmokePolicy(policy) {
  if (
    policy?.schemaVersion !== 1 ||
    policy?.gate !== 'production-auth-smoke' ||
    typeof policy?.owner !== 'string' ||
    policy.owner.length === 0 ||
    policy?.initialMode !== 'advisory' ||
    positiveInteger(policy?.advisoryAfterControllerRunId) === null ||
    policy?.graduation?.consecutiveExactMainPasses !== 10
  ) {
    throw new Error('Malformed production auth smoke release policy');
  }
  return policy;
}

export function classifyProductionAuthSmokePolicy({
  policy,
  controllerWorkflowId,
  runs,
}) {
  validateProductionAuthSmokePolicy(policy);
  const workflowId = positiveInteger(controllerWorkflowId);
  if (!workflowId || !Array.isArray(runs)) {
    throw new Error('Malformed production controller history');
  }

  const baseline = policy.advisoryAfterControllerRunId;
  const ordered = runs
    .filter(entry => entry?.run?.id > baseline)
    .sort((left, right) => left.run.id - right.run.id);
  if (new Set(ordered.map(entry => entry.run.id)).size !== ordered.length) {
    throw new Error('Duplicate production controller run evidence');
  }

  let currentStreak = 0;
  let maximumStreak = 0;
  let graduatedRunId = null;
  let productionRuns = 0;

  for (const entry of ordered) {
    const { run, jobs } = entry;
    if (
      !run ||
      positiveInteger(run.id) === null ||
      positiveInteger(run.run_attempt) === null ||
      run.workflow_id !== workflowId ||
      run.path !== CONTROLLER_PATH ||
      run.head_branch !== 'main' ||
      run.event !== 'workflow_run' ||
      run.status !== 'completed' ||
      typeof run.conclusion !== 'string' ||
      !Array.isArray(jobs)
    ) {
      throw new Error('Malformed exact-main production controller evidence');
    }

    const release = completedJob(
      jobs,
      'Production Release / Production release result'
    );
    if (release.conclusion !== 'success') continue;

    productionRuns += 1;
    const passed = REQUIRED_PASSING_JOBS.every(
      name => completedJob(jobs, name).conclusion === 'success'
    );
    currentStreak = passed ? currentStreak + 1 : 0;
    if (currentStreak > maximumStreak) {
      maximumStreak = currentStreak;
      if (
        maximumStreak >= policy.graduation.consecutiveExactMainPasses &&
        graduatedRunId === null
      ) {
        graduatedRunId = run.id;
      }
    }
  }

  return {
    gate: policy.gate,
    owner: policy.owner,
    mode: graduatedRunId === null ? policy.initialMode : 'blocking',
    threshold: policy.graduation.consecutiveExactMainPasses,
    currentStreak,
    maximumStreak,
    productionRuns,
    graduatedRunId,
  };
}

function runGh(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`gh ${args.join(' ')} failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function inspectOnline(argv) {
  const values = Object.fromEntries(
    argv.map(argument => {
      const [key, value] = argument.split('=', 2);
      if (!key?.startsWith('--') || !value) {
        throw new Error(`Expected --key=value, received ${argument}`);
      }
      return [key.slice(2), value];
    })
  );
  const repository = values.repo;
  const workflowId = positiveInteger(values['controller-workflow-id']);
  const currentRunId = positiveInteger(values['current-run-id']);
  if (!repository || !workflowId || !currentRunId) {
    throw new Error(
      '--repo, --controller-workflow-id, and --current-run-id are required'
    );
  }

  const policy = validateProductionAuthSmokePolicy(
    JSON.parse(readFileSync(values.policy, 'utf8'))
  );
  const pages = runGh([
    'api',
    '--paginate',
    '--slurp',
    `repos/${repository}/actions/workflows/production-controller.yml/runs?branch=main&event=workflow_run&per_page=100`,
  ]);
  if (!Array.isArray(pages)) {
    throw new Error('Malformed production controller run listing');
  }

  const candidates = pages
    .flatMap(page => page?.workflow_runs ?? [])
    .filter(
      run =>
        run?.id > policy.advisoryAfterControllerRunId &&
        run.id !== currentRunId &&
        run.status === 'completed'
    )
    .sort((left, right) => left.id - right.id);
  const historicalRuns = [];
  for (const run of candidates) {
    const jobs = runGh([
      'api',
      `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    ]);
    if (
      !Number.isSafeInteger(jobs?.total_count) ||
      !Array.isArray(jobs.jobs) ||
      jobs.total_count !== jobs.jobs.length
    ) {
      throw new Error(`Incomplete job listing for controller run ${run.id}`);
    }
    historicalRuns.push({ run, jobs: jobs.jobs });
    const result = classifyProductionAuthSmokePolicy({
      policy,
      controllerWorkflowId: workflowId,
      runs: historicalRuns,
    });
    if (result.mode === 'blocking') return result;
  }

  return classifyProductionAuthSmokePolicy({
    policy,
    controllerWorkflowId: workflowId,
    runs: historicalRuns,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(
      `${JSON.stringify(inspectOnline(process.argv.slice(2)))}\n`
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
