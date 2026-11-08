import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { SOURCE_GUARDS } from '../../ci-fast-lanes.mjs';
import {
  installSplitSuiteHooks,
  root,
} from './synthetic-canary-liveness.fixtures.mjs';

installSplitSuiteHooks();
describe('watchdog wiring', () => {
  /** @typedef {{name?: string, id?: string, uses?: string, run?: string, if?: string,
   * env?: Record<string, string>, with?: Record<string, string>, 'continue-on-error'?: boolean}} Step */
  /** @typedef {{on: {schedule?: unknown, workflow_run: {workflows: string[]}},
   * jobs: Record<string, {steps: Step[]}>, 'run-name'?: string}} Workflow */
  const load = name =>
    /** @type {Workflow} */ (
      loadYaml(readFileSync(join(root, '.github/workflows', name), 'utf8'))
    );
  const observer = load('automation-liveness.yml');
  const producer = load('synthetic-monitoring.yml');
  const steps = observer.jobs.liveness.steps;

  it('uses exactly the synthetic failure alert action, channel and webhook', () => {
    const failure = producer.jobs['synthetic-test'].steps.find(
      step => step.name === 'Send Slack Alert on Failure'
    );
    const alarm = steps.find(
      step => step.name === 'Send Slack Alert on Synthetic Silence'
    );
    expect(alarm.uses).toBe(failure.uses);
    expect(alarm.with.channel).toBe(failure.with.channel);
    expect(alarm.with.author_name).toBe(failure.with.author_name);
    expect(alarm.env).toEqual(failure.env);
    expect(alarm.if).toContain('always()');
    expect(alarm.if).toContain(
      "steps.synthetic-heartbeat.outcome != 'success'"
    );
    expect(alarm.with.custom_payload).toContain(
      'heartbeat check did not complete'
    );
    const intake = steps.find(
      step => step.name === 'File synthetic heartbeat Linear issue'
    );
    const failureIntake = producer.jobs['synthetic-test'].steps.find(
      step => step.name === 'File or resolve the synthetic Linear issue'
    );
    expect(intake.run).toBe('node scripts/synthetic-monitoring-intake.mjs');
    expect(failureIntake.run).toContain(
      'node scripts/synthetic-monitoring-intake.mjs'
    );
    expect(intake.env.LINEAR_API_KEY).toBe(failureIntake.env.LINEAR_API_KEY);
    expect(intake.env.REMEDIATION_TRIGGERS_DISABLED).toBe(
      failureIntake.env.REMEDIATION_TRIGGERS_DISABLED
    );
    expect(intake.env.TEST_STATUS).toBe('failed');
    expect(intake.env.FAILED_TESTS).toContain(
      'heartbeat check did not complete'
    );
    expect(intake.if).toBe(alarm.if);
  });

  it('alerts before preserving failure, using the existing backstop without a cron or flag', () => {
    expect(observer.on.schedule).toBeUndefined();
    expect(observer.on.workflow_run.workflows).toEqual([
      'Production Continuity Guard',
    ]);
    expect(producer['run-name']).toContain('github.event.schedule');
    const probe = steps.find(step => step.id === 'synthetic-heartbeat');
    expect(probe.run).toBe('node scripts/synthetic-canary-liveness.mjs');
    expect(probe['continue-on-error']).toBeUndefined();
    expect(probe.if).toBe('${{ always() }}');
    const preserve = steps.find(
      step => step.name === 'Preserve synthetic dead-man failure'
    );
    expect(preserve.run).toContain('exit 1');
    expect(steps.indexOf(preserve)).toBeGreaterThan(
      steps.findIndex(
        step => step.name === 'Send Slack Alert on Synthetic Silence'
      )
    );
    expect(preserve.if).toContain('always()');
  });

  it('enforces behavior coverage in source and merge-group CI for every changed input', () => {
    const guard = SOURCE_GUARDS.find(
      item => item.id === 'synthetic-canary-liveness'
    );
    expect(guard.prOnly).toBe(false);
    for (const file of [
      '.github/workflows/automation-liveness.yml',
      '.github/workflows/synthetic-monitoring.yml',
      'scripts/synthetic-canary-liveness.mjs',
      'scripts/lib/__tests__/synthetic-canary-liveness.test.mjs',
    ]) {
      expect(guard.inputs.test(file)).toBe(true);
    }
    expect(guard.command).toContain(
      'lib/__tests__/synthetic-canary-liveness.test.mjs'
    );
    expect(guard.command).toContain('run --coverage');
    expect(guard.command).toContain(
      '--coverage.include=synthetic-canary-liveness.mjs'
    );
    expect(guard.command).toContain('--coverage.thresholds.lines=90');
  });
});
