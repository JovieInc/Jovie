import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetGateRefreshWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/fleet-gate-refresh.yml'),
  'utf8'
);

// JOV-INV-042: the receipt follows main events and the Gem lanes emitter; no
// clock may come back to rewrite observedAt.
const SCHEDULE_TRIGGER = /^  schedule:/m;
const MAIN_CI_COMPLETION =
  'workflow_run:\n    workflows: [CI]\n    types: [completed]\n    branches: [main]';
const STACK_EVENT_GUARD =
  /workflow_dispatch:[\s\S]*steps\.refresh\.outcome == 'success'[\s\S]*steps\.refresh\.outputs\.receipt_path/;

function assertTrustedStackHealthContract(value) {
  expect(value).not.toMatch(SCHEDULE_TRIGGER);
  expect(value).toContain(MAIN_CI_COMPLETION);
  expect(value).not.toContain('steps.debounce');
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
    '--closure-health-file="${{ steps.refresh.outputs.receipt_path || steps.writer.outputs.receipt_path }}"'
  );
  expect(value).not.toContain('state/gem-priority-gate/latest.json');
  // The canonical receipt belongs to the lanes emitter; this workflow writes
  // it only through the stale-receipt fallback choice.
  expect(value).toContain(
    'GEM_PRIORITY_GATE_STATE_DIR: ${{ steps.writer.outputs.state_dir }}'
  );
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
    // Main CI completion is the one direct workflow_run input (pending ->
    // green has no local signal on Gem). Marker Recovery still dispatches the
    // gate after durable bytes so it stays within GitHub's workflow_run chain
    // cap; no release workflow wakes it through workflow_run.
    expect(fleetGateRefreshWorkflow).toContain(
      'workflow_run:\n    workflows: [CI]\n    types: [completed]\n    branches: [main]'
    );
    expect(fleetGateRefreshWorkflow.match(/workflow_run:/g)).toHaveLength(1);
    expect(fleetGateRefreshWorkflow).not.toContain(
      'Production Marker Recovery]'
    );
    expect(fleetGateRefreshWorkflow).not.toContain('pull_request_target:');
    assertTrustedStackHealthContract(fleetGateRefreshWorkflow);
    expect(fleetGateRefreshWorkflow).toContain('push:\n    branches: [main]');
    expect(fleetGateRefreshWorkflow).not.toMatch(SCHEDULE_TRIGGER);
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
        '  workflow_dispatch:\n',
        "  schedule:\n    - cron: '*/5 * * * *'\n  workflow_dispatch:\n"
      ),
      fleetGateRefreshWorkflow.replace(MAIN_CI_COMPLETION, ''),
      fleetGateRefreshWorkflow.replace(
        'ref: main',
        'ref: ${{ github.event.pull_request.head.sha }}'
      ),
      fleetGateRefreshWorkflow.replace(
        '${{ steps.refresh.outputs.receipt_path || steps.writer.outputs.receipt_path }}',
        'state/gem-priority-gate/latest.json'
      ),
      fleetGateRefreshWorkflow.replace(
        'GEM_PRIORITY_GATE_STATE_DIR: ${{ steps.writer.outputs.state_dir }}',
        'GEM_PRIORITY_GATE_STATE_DIR: /home/timwhite/gem-workspace/state/gem-priority-gate'
      ),
    ];
    for (const workflowValue of regressions) {
      expect(() => assertTrustedStackHealthContract(workflowValue)).toThrow();
    }
  });
});
