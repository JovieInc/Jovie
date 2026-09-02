import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const releaseScript = readFileSync(
  resolve(repoRoot, 'scripts/release-queue-deferred.sh'),
  'utf8'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/queue-deferred-release.yml'),
  'utf8'
);
const autoenroll = readFileSync(
  resolve(repoRoot, '.github/workflows/merge-queue-autoenroll.yml'),
  'utf8'
);
const drain = readFileSync(
  resolve(repoRoot, 'scripts/drain-pr-queue.sh'),
  'utf8'
);
const admission = readFileSync(
  resolve(repoRoot, 'scripts/lib/queue-deferred-release-admission.mjs'),
  'utf8'
);
const fleetGateRefreshWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/fleet-gate-refresh.yml'),
  'utf8'
);

const STACK_TRIGGER_TYPES =
  'types: [opened, edited, synchronize, converted_to_draft, closed, labeled, unlabeled, reopened]';
const STACK_EVENT_GUARD =
  /pull_request_target:[\s\S]*if: steps\.refresh\.outcome == 'success'[\s\S]*steps\.refresh\.outputs\.receipt_path/;

function assertTrustedStackHealthContract(value) {
  expect(value).toContain(STACK_TRIGGER_TYPES);
  expect(value).toMatch(STACK_EVENT_GUARD);
  expect(value).toMatch(
    /Checkout exact main gate code[\s\S]*ref: main[\s\S]*persist-credentials: false/
  );
  expect(value).not.toMatch(
    /Checkout exact main gate code[\s\S]*github.event.pull_request.head.sha/
  );
  expect(value).toContain(
    'node "$GITHUB_WORKSPACE/scripts/backlog-orchestrator/delivery-state-machine.mjs"'
  );
  expect(value).toContain(
    '--closure-health-file="${{ steps.refresh.outputs.receipt_path }}"'
  );
  expect(value).not.toContain('state/gem-priority-gate/latest.json');
  expect(value).toContain("steps.stack-actions.outcome == 'success'");
}

describe('queue-deferred release closed loop (JOV-5054)', () => {
  it('scans every queue-deferred PR, not only agent-branch PRs', () => {
    expect(releaseScript).toContain('scanning open queue-deferred PRs');
    expect(releaseScript).not.toContain(
      'scanning open queue-deferred agent PRs'
    );
    expect(releaseScript).not.toContain('AGENT_BRANCH_RE');
    expect(releaseScript).not.toContain('select(.head | test($branch_re))');
    expect(releaseScript).toContain('select(.owner == $repo_owner)');
    expect(workflow).toContain('every queue-deferred PR');
    expect(workflow).not.toContain('Untyped holds are never');
  });

  it('releases untyped ready holds only through fresh controller admission', () => {
    expect(releaseScript).toContain('classify-hold');
    expect(releaseScript).toContain('untyped-ready-hold');
    expect(releaseScript).toContain(
      'releasing only after fresh controller admission'
    );
    expect(releaseScript).not.toContain('never released automatically');
    expect(releaseScript).toContain('node "$LIB" human-policy-re');
  });

  it('still fail-closes human-policy holds and non-admitted fleet receipts', () => {
    expect(releaseScript).toContain('human-policy-re');
    expect(releaseScript).toContain('queue-deferred-release-admission.mjs');
    expect(admission).toContain('fleet-gate-not-releasable');
    expect(releaseScript).toContain('fleet-receipt-stale');
    expect(releaseScript).toContain('every queue-deferred hold stays in place');
  });

  it('carries the exact bot receipt through the degraded release lifecycle', () => {
    expect(autoenroll).toContain(
      "steps.admission.outputs.deferred_release == '1'"
    );
    expect(autoenroll).toContain("'deferred-release-only'");
    expect(autoenroll).toContain(
      "needs.fleet-policy.outputs.mode != 'hold-intake'"
    );
    expect(drain).toContain(
      'exact-head controller queue-deferred release receipt'
    );
    expect(drain).toContain(
      'controller release evidence changed during native enrollment'
    );
    expect(drain).toContain(
      'Fleet receipt does not authorize the exact queue-deferred release fallback'
    );
  });

  it('keeps Fleet Gate Refresh as the one-way workflow_run bridge', () => {
    // CI and Production Controller are direct upstream semantic inputs.
    // Marker Recovery dispatches the gate as a fresh event after durable bytes
    // so Queue-Deferred Release stays within GitHub's workflow_run chain cap.
    const upstream = fleetGateRefreshWorkflow.match(
      /workflow_run:\s*\n(?:\s*#[^\n]*\n)*\s*workflows:\s*\[([^\]]+)\]/
    )?.[1];
    const downstream = workflow.match(
      /workflow_run:\s*\n\s*workflows:\s*\[([^\]]+)\]/
    )?.[1];

    expect(upstream).toBe('CI, Production Controller');
    expect(downstream).toBe("'Fleet Gate Refresh'");
    expect(upstream).not.toContain('Queue-Deferred Release');
    expect(downstream).not.toContain('CI');
    expect(downstream).not.toContain('Production Controller');
    expect(fleetGateRefreshWorkflow).toContain('pull_request_target:');
    assertTrustedStackHealthContract(fleetGateRefreshWorkflow);
    expect(fleetGateRefreshWorkflow).toContain('push:\n    branches: [main]');
    expect(fleetGateRefreshWorkflow).toContain(
      "github.event.workflow_run.conclusion != 'cancelled'"
    );
    expect(fleetGateRefreshWorkflow).toContain(
      'github.event.pull_request.merged != true'
    );
    expect(fleetGateRefreshWorkflow).not.toContain('schedule:');
    expect(workflow).toContain('workflow_dispatch:');
    const markerRecovery = readFileSync(
      resolve(repoRoot, '.github/workflows/production-marker-recovery.yml'),
      'utf8'
    );
    expect(markerRecovery).toContain(
      'gh workflow run fleet-gate-refresh.yml --ref main'
    );
  });

  it('keeps stack repair consumption fail-closed under trigger, checkout, and guard regressions', () => {
    const regressions = [
      fleetGateRefreshWorkflow.replace(
        STACK_TRIGGER_TYPES,
        'types: [closed, labeled, unlabeled, reopened]'
      ),
      fleetGateRefreshWorkflow.replace(
        'ref: main',
        'ref: ${{ github.event.pull_request.head.sha }}'
      ),
      fleetGateRefreshWorkflow.replace(
        '${{ steps.refresh.outputs.receipt_path }}',
        'state/gem-priority-gate/latest.json'
      ),
    ];
    for (const workflowValue of regressions) {
      expect(() => assertTrustedStackHealthContract(workflowValue)).toThrow();
    }
  });
});
