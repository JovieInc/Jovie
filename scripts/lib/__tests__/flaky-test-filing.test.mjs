import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planFlakyTestFiling } from '../flaky-test-filing.mjs';

const retired = readFileSync(
  '.github/workflows/test-flakiness-report.yml',
  'utf8'
);

describe('flaky-test filing remediation', () => {
  it('serializes signature writes and isolates main analysis from queue publication', () => {
    const triggers = retired
      .split('\non:\n', 2)[1]
      .split('\nconcurrency:', 1)[0];
    const concurrency = retired
      .split('\nconcurrency:\n', 2)[1]
      .split('\npermissions:', 1)[0];

    expect(triggers).toContain("branches: [main, 'gh-readonly-queue/main/**']");
    expect(concurrency).toContain('cancel-in-progress: false');
    expect(concurrency).toContain('github.event.workflow_run.event');
    expect(retired).toContain(
      "github.event.workflow_run.head_branch == 'main'"
    );
    expect(retired).not.toContain('collect-quarantine-evidence.mjs');
    expect(retired).not.toContain('quarantine-evidence.json');
    expect(retired).toContain(
      'node scripts/file-quarantine-clusters.mjs --report-only'
    );
    expect(retired).toContain(
      "!cancelled() && steps.analyze.outputs.signature_quarantine_candidates != ''"
    );
  });

  it('keeps GitHub issue filing retired', () => {
    expect(retired).not.toContain('github.rest.issues');
    expect(retired).not.toContain('gh issue');
    expect(retired).not.toContain('__retired_linear_only__');
    expect(retired).not.toContain('issues: write');
  });

  it('files a red ratchet through the remediation label', () => {
    expect(planFlakyTestFiling({ ratchetFailed: false })).toBeNull();
    const plan = planFlakyTestFiling({
      ratchetFailed: true,
      flakyCount: '4',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    });
    expect(plan.fingerprint).toBe('remediation:flaky-test-filing');
    expect(plan.title).toContain('(remediation:flaky-test-filing)');
    expect(plan.reopenTerminal).toBe(true);
    expect(plan.createStateName).toBe('Todo');
    expect(plan.description).toContain('JOV-6507');
  });
});
