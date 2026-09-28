import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const actionSource = readFileSync(
  resolve(repoRoot, '.github/actions/eval-main-health/action.yml'),
  'utf8'
);
const scriptMarker = '        script: |\n';
const script = actionSource
  .split(scriptMarker, 2)[1]
  .split('\n')
  .map(line => line.replace(/^ {10}/, ''))
  .join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const evaluate = new AsyncFunction('github', 'context', 'core', script);

const failingSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const greenSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function oldIso(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

async function runEvaluation({
  attempt = 2,
  greenRecovery = false,
  canaryFailure = false,
  currentMainSha = failingSha,
  ciLookupError = false,
  pullLookupError = false,
  mainLookupError = false,
  jobLookupError = false,
} = {}) {
  const failingRun = {
    id: 9001,
    run_number: 81,
    run_attempt: attempt,
    status: 'completed',
    conclusion: 'failure',
    head_sha: failingSha,
    created_at: oldIso(2),
    updated_at: oldIso(2),
    html_url: 'https://example.test/runs/9001',
  };
  const greenRun = {
    id: 8999,
    run_number: 80,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: greenSha,
    created_at: oldIso(4),
    updated_at: oldIso(4),
  };
  const recoveredRun = {
    id: 9002,
    run_number: 82,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: failingSha,
    created_at: oldIso(1),
    updated_at: oldIso(1),
  };

  const listWorkflowRuns = vi.fn(async () => {
    if (ciLookupError) throw new Error('CI runs lookup unavailable');
    return {
      data: {
        workflow_runs: greenRecovery
          ? [recoveredRun, failingRun, greenRun]
          : [failingRun, greenRun],
      },
    };
  });
  const listPulls = vi.fn();
  const listJobsForWorkflowRun = vi.fn();
  const getCommit = vi.fn(async () => {
    if (mainLookupError) throw new Error('main lookup unavailable');
    return { data: { sha: currentMainSha } };
  });
  const github = {
    rest: {
      actions: { listWorkflowRuns, listJobsForWorkflowRun },
      pulls: { list: listPulls },
      repos: { getCommit },
    },
    paginate: vi.fn(async (method, params) => {
      if (method === listJobsForWorkflowRun) {
        if (jobLookupError) throw new Error('job lookup unavailable');
        return [
          {
            name: canaryFailure ? 'Canary Deploy Gate' : 'Unit Tests',
            conclusion: 'failure',
          },
        ];
      }
      if (method === listPulls) {
        if (pullLookupError) throw new Error('pull lookup unavailable');
        return [];
      }
      throw new Error('unexpected pagination endpoint');
    }),
  };
  const outputs = {};
  const core = {
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    warning: vi.fn(),
  };

  process.env.STUCK_THRESHOLD_MINUTES = '45';
  process.env.NO_SUCCESS_THRESHOLD_HOURS = '3';
  await evaluate(
    github,
    {
      repo: { owner: 'JovieInc', repo: 'Jovie' },
      serverUrl: 'https://github.com',
      runId: 12345,
    },
    core
  );

  return { outputs, core };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Evaluate main CI health action', () => {
  it('offers one rerun on attempt one and alerts', async () => {
    const { outputs } = await runEvaluation({ attempt: 1 });

    expect(outputs.failed_run_id).toBe('9001');
    expect(outputs.should_alert).toBe('true');
    expect(outputs.failing_run_attempt).toBe('1');
    expect(outputs.evidence_known).toBe('true');
  });

  it('alerts without a rerun after the failed attempt one rerun', async () => {
    const { outputs } = await runEvaluation({ attempt: 2 });

    expect(outputs.failed_run_id).toBe('');
    expect(outputs.should_alert).toBe('true');
    expect(outputs.failing_run_attempt).toBe('2');
    expect(outputs.failing_run_id).toBe('9001');
  });

  it('does not emit a rerun when a canary or sentry gate failed', async () => {
    const { outputs } = await runEvaluation({
      attempt: 1,
      canaryFailure: true,
    });

    expect(outputs.failed_run_id).toBe('');
    expect(outputs.should_alert).toBe('true');
    expect(outputs.failed_job_names).toBe('Canary Deploy Gate');
  });

  it('reports healthy after CI recovers green on the failing SHA', async () => {
    const { outputs } = await runEvaluation({ greenRecovery: true });

    expect(outputs.should_alert).toBe('false');
    expect(outputs.failed_run_id).toBe('');
    expect(outputs.summary).toBe('Main CI is healthy.');
  });

  it('does not alert on an old failure after main advances without a CI run', async () => {
    const { outputs } = await runEvaluation({ currentMainSha: greenSha });

    expect(outputs.should_alert).toBe('false');
    expect(outputs.failed_run_id).toBe('');
    expect(outputs.failing_sha).toBe(failingSha);
  });

  it('suppresses alert and rerun when job evidence cannot be fetched', async () => {
    const { outputs, core } = await runEvaluation({ jobLookupError: true });

    expect(outputs.evidence_known).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.failed_run_id).toBe('');
    expect(core.warning).toHaveBeenCalled();
  });

  it('suppresses alert when the current main SHA cannot be verified', async () => {
    const { outputs, core } = await runEvaluation({ mainLookupError: true });

    expect(outputs.evidence_known).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.failed_run_id).toBe('');
    expect(core.warning).toHaveBeenCalled();
  });

  it('suppresses alert when merged-PR evidence cannot be fetched', async () => {
    const { outputs, core } = await runEvaluation({ pullLookupError: true });

    expect(outputs.evidence_known).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(core.warning).toHaveBeenCalled();
  });

  it('suppresses alert when no exact failing SHA can be read', async () => {
    const { outputs, core } = await runEvaluation({ ciLookupError: true });

    expect(outputs.evidence_known).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.summary).toBe('Main CI state is unavailable.');
    expect(core.warning).toHaveBeenCalled();
  });
});
