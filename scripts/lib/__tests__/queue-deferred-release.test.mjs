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
    // CI and Production Controller are upstream semantic inputs. Fleet Gate
    // Refresh turns them into one canonical receipt; Queue-Deferred Release
    // consumes only that receipt and must never wake the gate again.
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
    expect(fleetGateRefreshWorkflow).toContain('pull_request:');
    expect(fleetGateRefreshWorkflow).toContain(
      'types: [closed, labeled, unlabeled, ready_for_review, reopened]'
    );
    expect(fleetGateRefreshWorkflow).toContain('push:\n    branches: [main]');
    expect(workflow).toContain('workflow_dispatch:');
  });
});
