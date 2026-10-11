import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetGateRefreshWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/fleet-gate-refresh.yml'),
  'utf8'
);

const STACK_LIVENESS_CRON = "cron: '*/5 * * * *'";
const STACK_EVENT_GUARD =
  /schedule:[\s\S]*if: steps\.refresh\.outcome == 'success'[\s\S]*steps\.refresh\.outputs\.receipt_path/;

function assertTrustedStackHealthContract(value) {
  expect(value).toContain(STACK_LIVENESS_CRON);
  expect(value).toContain('group: fleet-gate-receipt');
  expect(value).toContain('cancel-in-progress: false');
  expect(value).toContain('branches: [main]');
  expect(value).not.toContain('pull_request_target:');
  expect(value).not.toContain('check_run:');
  expect(value).not.toContain('check_suite:');
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

describe('retired queue release and retained fleet refresh', () => {
  it('keeps the retired workflow and standalone release writer absent', () => {
    expect(
      existsSync(
        resolve(repoRoot, '.github/workflows/queue-deferred-release.yml')
      )
    ).toBe(false);
    expect(
      existsSync(resolve(repoRoot, 'scripts/release-queue-deferred.sh'))
    ).toBe(false);
  });

  it('keeps Fleet Gate Refresh as the one-way workflow_run bridge', () => {
    // CI and Production Controller are direct upstream semantic inputs.
    // Marker Recovery dispatches the gate after durable bytes so it remains
    // within GitHub's workflow_run chain cap.
    expect(fleetGateRefreshWorkflow).not.toContain('workflow_run:');
    expect(fleetGateRefreshWorkflow).not.toContain('pull_request_target:');
    assertTrustedStackHealthContract(fleetGateRefreshWorkflow);
    expect(fleetGateRefreshWorkflow).toContain('push:\n    branches: [main]');
    expect(fleetGateRefreshWorkflow).toContain('schedule:');
    expect(fleetGateRefreshWorkflow).toContain('cancel-in-progress: false');
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
        'cancel-in-progress: false',
        'cancel-in-progress: true'
      ),
      fleetGateRefreshWorkflow.replace(
        'group: fleet-gate-receipt',
        'group: fleet-gate-${{ github.run_id }}'
      ),
      fleetGateRefreshWorkflow.replace(
        STACK_LIVENESS_CRON,
        "cron: '0 0 * * *'"
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
