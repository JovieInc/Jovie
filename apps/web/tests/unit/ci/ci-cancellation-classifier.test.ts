import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  classifyCiCancellation,
  FIXED_RUNNER_SETUP_CANCELLATION,
} from '../../../../../scripts/lib/ci-cancellation-classifier.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const fixture = JSON.parse(
  readFileSync(
    resolve(testDir, 'fixtures/fixed-runner-setup-cancellation.json'),
    'utf8'
  )
);

function clonedFixture() {
  return structuredClone(fixture);
}

describe('CI cancellation classifier', () => {
  it('recognizes the captured fixed-runner setup-only cancellation', () => {
    expect(classifyCiCancellation(clonedFixture())).toEqual({
      retryable: true,
      action: 'rerun_failed_jobs',
      classification: FIXED_RUNNER_SETUP_CANCELLATION,
      reason: 'fixed_runner_cancelled_during_setup_before_test_execution',
      diagnostics: expect.objectContaining({
        sourceRunId: 29232227016,
        sourceRunAttempt: 1,
        prNumber: 14265,
        jobId: 86758828370,
        runnerId: 57,
        runnerName: 'gem-linux-4',
        testsExecuted: false,
      }),
    });
  });

  it.each([
    [
      'non-CI workflow',
      input => (input.run.name = 'Scope Judge'),
      'source_workflow_not_ci',
    ],
    [
      'non-cancelled run',
      input => (input.run.conclusion = 'failure'),
      'source_run_not_completed_cancelled',
    ],
    [
      'second attempt',
      input => (input.run.run_attempt = 2),
      'source_run_already_retried',
    ],
    ['closed PR', input => (input.livePr.state = 'closed'), 'no_live_open_pr'],
    [
      'moved PR head',
      input => (input.livePr.head.sha = 'new-head'),
      'pr_head_moved',
    ],
    [
      'newer CI run for the same head',
      input =>
        input.recentRuns.push({
          ...input.run,
          id: input.run.id + 1,
          run_number: input.run.run_number + 1,
        }),
      'newer_ci_run_same_head',
    ],
    [
      'no cancelled job',
      input => (input.jobs[0].conclusion = 'failure'),
      'cancelled_job_count_not_one',
    ],
    [
      'multiple cancelled jobs',
      input => input.jobs.push({ ...input.jobs[0], id: 99 }),
      'cancelled_job_count_not_one',
    ],
    [
      'hosted runner',
      input => (input.jobs[0].labels = ['ubuntu-latest']),
      'cancelled_job_not_fixed_runner',
    ],
    [
      'missing runner identity',
      input => (input.jobs[0].runner_id = null),
      'cancelled_job_missing_runner_identity',
    ],
    [
      'checkout began',
      input =>
        input.jobs[0].steps.push({
          name: 'Run actions/checkout',
          conclusion: 'cancelled',
        }),
      'cancelled_job_not_setup_only',
    ],
    [
      'setup completed',
      input => (input.jobs[0].steps[0].conclusion = 'success'),
      'cancelled_job_not_setup_only',
    ],
  ])('fails closed for %s', (_name, mutate, expectedReason) => {
    const input = clonedFixture();
    mutate(input);

    expect(classifyCiCancellation(input)).toMatchObject({
      retryable: false,
      action: 'diagnose_only',
      classification: 'not_retryable',
      reason: expectedReason,
    });
  });

  it('keeps the workflow bounded, hosted, policy-sourced, and fail-closed', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/ci-cancellation-healer.yml'),
      'utf8'
    );
    const ciWorkflow = readFileSync(
      resolve(repoRoot, '.github/workflows/ci.yml'),
      'utf8'
    );

    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('workflows: [CI]');
    expect(workflow).toContain(
      "if: github.event.workflow_run.conclusion == 'cancelled'"
    );
    expect(workflow).toContain(
      'group: fixed-runner-cancel-heal-${{ github.event.workflow_run.id }}'
    );
    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('current_attempt');
    expect(workflow).toContain('live_head');
    expect(workflow).toContain('newer_count');
    expect(workflow).toContain('gh run rerun "$SOURCE_RUN_ID" --failed');
    expect(workflow).not.toContain('|| echo "Auto-rerun failed');

    expect(ciWorkflow).toContain('name: PR Ready');
    expect(ciWorkflow).toContain(
      'Unit tests did not pass (result: $UNIT_RESULT)'
    );
  });
});
