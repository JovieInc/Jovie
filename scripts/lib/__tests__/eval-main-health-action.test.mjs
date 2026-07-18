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
const priorSha = 'cccccccccccccccccccccccccccccccccccccccc';

function oldIso(hoursAgo) {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

async function runEvaluation({
  attempt = 2,
  activeAutofixRuns = [],
  openAutofixPulls = [],
  markerStatusesBySha = {},
  greenRecovery = false,
  currentMainSha = failingSha,
  ciLookupError = false,
  repairLookupError = false,
  mainLookupError = false,
  markerLookupError = false,
  markerLookupErrorShas = [],
  jobLookupError = false,
  createMarkerError = false,
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
  const listCommitStatusesForRef = vi.fn();
  const getCommit = vi.fn(async () => {
    if (mainLookupError) throw new Error('main lookup unavailable');
    return { data: { sha: currentMainSha } };
  });
  const createCommitStatus = vi.fn(async () => {
    if (createMarkerError) throw new Error('status write unavailable');
    return { data: {} };
  });
  const github = {
    rest: {
      actions: { listWorkflowRuns, listJobsForWorkflowRun },
      pulls: { list: listPulls },
      repos: { listCommitStatusesForRef, createCommitStatus, getCommit },
    },
    paginate: vi.fn(async (method, params) => {
      if (method === listJobsForWorkflowRun) {
        if (jobLookupError) throw new Error('job lookup unavailable');
        return [{ name: 'Unit Tests', conclusion: 'failure' }];
      }
      if (method === listPulls) {
        if (repairLookupError) throw new Error('pull lookup unavailable');
        if (params.state === 'open') {
          return openAutofixPulls;
        }
        return [];
      }
      if (method === listWorkflowRuns) {
        if (repairLookupError) throw new Error('workflow lookup unavailable');
        return activeAutofixRuns;
      }
      if (method === listCommitStatusesForRef) {
        if (markerLookupError || markerLookupErrorShas.includes(params.ref)) {
          throw new Error('status lookup unavailable');
        }
        return markerStatusesBySha[params.ref] ?? [];
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
  process.env.AUTOFIX_CROSS_SHA_WINDOW_MINUTES = '60';
  process.env.AUTOFIX_CROSS_SHA_LIMIT = '2';
  process.env.AUTOFIX_OWNERSHIP_LEASE_MINUTES = '30';
  process.env.AUTOFIX_ATTEMPT_LIMIT = '3';
  await evaluate(
    github,
    {
      repo: { owner: 'JovieInc', repo: 'Jovie' },
      serverUrl: 'https://github.com',
      runId: 12345,
    },
    core
  );

  return { outputs, core, createCommitStatus };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Evaluate main CI health action', () => {
  it('offers one rerun but does not autofix attempt one', async () => {
    const { outputs } = await runEvaluation({ attempt: 1 });

    expect(outputs.failed_run_id).toBe('9001');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('awaiting_one_shot_rerun');
    expect(outputs.failing_run_attempt).toBe('1');
  });

  it('permits autofix only after the failed rerun', async () => {
    const { outputs } = await runEvaluation({ attempt: 2 });

    expect(outputs.failed_run_id).toBe('');
    expect(outputs.needs_autofix).toBe('true');
    expect(outputs.failing_run_attempt).toBe('2');
    expect(outputs.repair_state_known).toBe('true');
  });

  it('does not treat a healthy autofix workflow invocation as a cross-SHA repair attempt', async () => {
    const { outputs } = await runEvaluation({
      activeAutofixRuns: [
        {
          id: 700,
          head_sha: priorSha,
          status: 'completed',
          conclusion: 'success',
          created_at: oldIso(0.1),
        },
      ],
    });

    expect(outputs.needs_autofix).toBe('true');
    expect(outputs.systemic).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('');
  });

  it('escalates only when another recent SHA durably owns a repair attempt', async () => {
    const { outputs } = await runEvaluation({
      activeAutofixRuns: [
        {
          id: 700,
          head_sha: priorSha,
          status: 'completed',
          conclusion: 'failure',
          created_at: oldIso(0.1),
        },
      ],
      markerStatusesBySha: {
        [priorSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'owned:run-700:attempt-1',
            created_at: oldIso(0.1),
          },
        ],
      },
    });

    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.systemic).toBe('true');
    expect(outputs.autofix_skip_reason).toBe('systemic_multiple_shas_failing');
  });

  it('fails closed when cross-SHA durable ownership cannot be inspected', async () => {
    const { outputs, createCommitStatus } = await runEvaluation({
      activeAutofixRuns: [
        {
          id: 700,
          head_sha: priorSha,
          status: 'completed',
          conclusion: 'success',
          created_at: oldIso(0.1),
        },
      ],
      markerLookupErrorShas: [priorSha],
    });

    expect(outputs.repair_state_known).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('repair_state_unavailable');
    expect(outputs.should_alert).toBe('true');
    expect(createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        sha: failingSha,
        context: 'main-autofix/ownership',
        description: 'uncertain:repair_state_unavailable',
      })
    );
  });

  it('suppresses duplicate alert and dispatch for an active exact-SHA workflow', async () => {
    const { outputs } = await runEvaluation({
      activeAutofixRuns: [
        {
          id: 777,
          head_sha: failingSha,
          status: 'in_progress',
          created_at: oldIso(1),
        },
      ],
    });

    expect(outputs.repair_in_flight).toBe('true');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('repair_in_flight');
  });

  it('suppresses duplicate alert and dispatch for an open exact-SHA repair PR', async () => {
    const { outputs } = await runEvaluation({
      openAutofixPulls: [
        {
          labels: [{ name: 'autofix' }],
          head: { ref: 'autofix/main-aaaaaaa-1' },
          body: `- **Failing SHA:** \`${failingSha}\``,
        },
      ],
    });

    expect(outputs.repair_in_flight).toBe('true');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
  });

  it('suppresses duplicate alert and dispatch for an exact-SHA terminal marker', async () => {
    const { outputs } = await runEvaluation({
      markerStatusesBySha: {
        [failingSha]: [
          {
            id: 1,
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'released:pr-42:attempt-1',
            created_at: oldIso(1),
          },
          {
            id: 2,
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'terminal:no_changes:attempt-1',
            created_at: oldIso(0.1),
          },
        ],
      },
    });

    expect(outputs.repair_terminal).toBe('true');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('terminal_repair_recorded');
  });

  it('keeps an old ownership marker while its exact-SHA run is still active', async () => {
    const { outputs } = await runEvaluation({
      activeAutofixRuns: [
        {
          id: 777,
          head_sha: failingSha,
          status: 'in_progress',
          created_at: oldIso(1),
        },
      ],
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'owned:run-777:attempt-1',
            created_at: oldIso(1),
          },
        ],
      },
    });

    expect(outputs.repair_marker_owned).toBe('true');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('repair_marker_owned');
  });

  it('counts a canceled ownership lease and admits the next bounded retry', async () => {
    const { outputs } = await runEvaluation({
      activeAutofixRuns: [
        {
          id: 777,
          head_sha: failingSha,
          status: 'completed',
          conclusion: 'cancelled',
          created_at: oldIso(0.1),
        },
      ],
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'owned:run-777:attempt-1',
            created_at: oldIso(0.1),
          },
        ],
      },
    });

    expect(outputs.repair_marker_owned).toBe('false');
    expect(outputs.repair_terminal).toBe('false');
    expect(outputs.repair_attempt).toBe('2');
    expect(outputs.needs_autofix).toBe('true');
  });

  it('gives a fresh orphaned marker a bounded consistency grace lease', async () => {
    const { outputs } = await runEvaluation({
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'owned:run-777:attempt-1',
            created_at: oldIso(0.1),
          },
        ],
      },
    });

    expect(outputs.repair_marker_owned).toBe('true');
    expect(outputs.needs_autofix).toBe('false');
  });

  it('expires an orphaned ownership marker before retrying', async () => {
    const { outputs } = await runEvaluation({
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'owned:run-777:attempt-1',
            created_at: oldIso(1),
          },
        ],
      },
    });

    expect(outputs.repair_in_flight).toBe('false');
    expect(outputs.repair_marker_owned).toBe('false');
    expect(outputs.repair_attempt).toBe('2');
    expect(outputs.needs_autofix).toBe('true');
  });

  it('turns exhausted durable ownership history into a terminal escalation', async () => {
    const { outputs } = await runEvaluation({
      markerStatusesBySha: {
        [failingSha]: [1, 2, 3].map(attemptNumber => ({
          context: 'main-autofix/ownership',
          state: 'success',
          description: `owned:run-${700 + attemptNumber}:attempt-${attemptNumber}`,
          created_at: oldIso(attemptNumber),
        })),
      },
    });

    expect(outputs.repair_attempt).toBe('4');
    expect(outputs.repair_terminal).toBe('true');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('terminal_repair_recorded');
  });

  it('ignores a terminal marker attached to a stale SHA', async () => {
    const { outputs } = await runEvaluation({
      markerStatusesBySha: {
        [greenSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'terminal:no_changes:attempt-1',
          },
        ],
      },
    });

    expect(outputs.repair_terminal).toBe('false');
    expect(outputs.should_alert).toBe('true');
    expect(outputs.needs_autofix).toBe('true');
  });

  it('ignores the exact-SHA marker after CI recovers green', async () => {
    const { outputs } = await runEvaluation({
      greenRecovery: true,
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'terminal:no_changes:attempt-1',
          },
        ],
      },
    });

    expect(outputs.repair_terminal).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.summary).toBe('Main CI is healthy.');
  });

  it('does not redispatch an old failure after main advances without a CI run', async () => {
    const { outputs } = await runEvaluation({
      currentMainSha: greenSha,
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'released:sha_drift:attempt-1',
            created_at: oldIso(0.1),
          },
        ],
      },
    });

    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.failing_sha).toBe(failingSha);
    expect(outputs.should_alert).toBe('false');
  });

  it('alerts repair-state uncertainty only once per exact SHA', async () => {
    const first = await runEvaluation({ repairLookupError: true });

    expect(first.outputs.repair_state_known).toBe('false');
    expect(first.outputs.needs_autofix).toBe('false');
    expect(first.outputs.autofix_skip_reason).toBe('repair_state_unavailable');
    expect(first.outputs.should_alert).toBe('true');
    expect(first.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        sha: failingSha,
        context: 'main-autofix/ownership',
        description: 'uncertain:repair_state_unavailable',
      })
    );

    const repeated = await runEvaluation({
      repairLookupError: true,
      markerStatusesBySha: {
        [failingSha]: [
          {
            context: 'main-autofix/ownership',
            state: 'success',
            description: 'uncertain:repair_state_unavailable',
            created_at: oldIso(0.1),
          },
        ],
      },
    });

    expect(repeated.outputs.repair_state_known).toBe('false');
    expect(repeated.outputs.should_alert).toBe('false');
    expect(repeated.outputs.needs_autofix).toBe('false');
    expect(repeated.createCommitStatus).not.toHaveBeenCalled();
  });

  it('suppresses Slack and dispatch when marker lookup cannot prove deduplication', async () => {
    const { outputs, core, createCommitStatus } = await runEvaluation({
      markerLookupError: true,
    });

    expect(outputs.repair_state_known).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(outputs.autofix_skip_reason).toBe('repair_state_unavailable');
    expect(createCommitStatus).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalled();
  });

  it('suppresses Slack and dispatch when no exact failing SHA can be read', async () => {
    const { outputs, core, createCommitStatus } = await runEvaluation({
      ciLookupError: true,
    });

    expect(outputs.repair_state_known).toBe('false');
    expect(outputs.should_alert).toBe('false');
    expect(outputs.needs_autofix).toBe('false');
    expect(createCommitStatus).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalled();
  });
});
