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
});
