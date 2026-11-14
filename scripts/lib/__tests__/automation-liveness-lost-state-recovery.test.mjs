import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  livenessDecisions,
  livenessFingerprint,
} from '../automation-registry.mjs';
import { lostStatePrevious } from '../liveness-lost-state.mjs';

// JOV-9641: during the 2026-11-14 Vercel DEPLOYMENT_PAUSED outage the
// installation REST budget ran dry, so a liveness run's "Restore previous
// alert state" step failed silently (`gh api` 403 behind `|| true`) and the
// filing run executed with no persisted alert state. summer:heartbeat came
// back fresh on that same run, but the green resolution only fired on a
// recorded red -> green transition: the run marked the fingerprint green
// without resolving the open Linear alert, and no later run retried, so the
// P0 stayed open with no resolution path. A lost restore must reconcile:
// stateless critical rows read as red, so a recovered loop resolves its open
// alert on the same run, and a failed apply persists that red for a retry.

const HEARTBEAT = livenessFingerprint('summer:heartbeat');
const MODEL_TURNS = livenessFingerprint('summer:model-turns');

const row = (id, status) => ({
  id,
  critical: true,
  status,
  reason: status === 'fresh' ? null : 'json-http-503',
  lastProofAt: status === 'fresh' ? '2026-11-14T05:47:26.000Z' : null,
  budgetMinutes: 30,
  escalationOwner: 'summer',
  url: 'https://summer.jov.ie/runtime/v1/health',
});

function statePath(withState) {
  const dir = mkdtempSync(join(tmpdir(), 'liveness-lost-state-'));
  const path = join(dir, 'state.json');
  if (withState) writeFileSync(path, `${JSON.stringify(withState)}\n`);
  return path;
}

describe('lostStatePrevious (JOV-9641)', () => {
  it('returns the persisted state unchanged when the state file exists', () => {
    const args = { previous: statePath({ [HEARTBEAT]: 'red' }) };
    const report = { results: [row('summer:heartbeat', 'fresh')] };
    expect(lostStatePrevious(args, report, { [HEARTBEAT]: 'red' })).toEqual({
      [HEARTBEAT]: 'red',
    });
  });

  it('returns the persisted state unchanged without a --previous argument', () => {
    const report = { results: [row('summer:heartbeat', 'fresh')] };
    expect(lostStatePrevious({}, report, {})).toEqual({});
  });

  it("records 'red' for stateless critical rows when the restore was lost", () => {
    const args = { previous: statePath(false) };
    const report = {
      results: [
        row('summer:heartbeat', 'fresh'),
        { ...row('summer:receiver-outcomes', 'missing'), critical: false },
      ],
    };
    expect(lostStatePrevious(args, report, {})).toEqual({
      [HEARTBEAT]: 'red',
    });
  });

  it('keeps recorded states and never invents one for a non-critical row', () => {
    const args = { previous: statePath(false) };
    const report = {
      results: [
        row('summer:heartbeat', 'fresh'),
        row('summer:model-turns', 'fresh'),
        { ...row('summer:receiver-outcomes', 'missing'), critical: false },
      ],
    };
    expect(lostStatePrevious(args, report, { [MODEL_TURNS]: 'green' })).toEqual(
      {
        [HEARTBEAT]: 'red',
        [MODEL_TURNS]: 'green',
      }
    );
  });
});

describe('a lost restore resolves the alert instead of stranding it (JOV-9641)', () => {
  const args = { previous: statePath(false) };
  const report = { results: [row('summer:heartbeat', 'fresh')] };

  it('fires the green resolution for a recovered loop with no recorded state', () => {
    expect(
      livenessDecisions(report, lostStatePrevious(args, report, {}))
    ).toEqual([
      { action: 'green', fingerprint: HEARTBEAT, id: 'summer:heartbeat' },
    ]);
  });

  it('is the reconciliation that resolves it: the raw lost state cannot', () => {
    // The pre-fix computation on the 2026-11-14 run: a fresh row with no
    // recorded state produced no decision, so the open alert was stranded.
    expect(livenessDecisions(report, {})).toEqual([]);
  });

  it('retries after a failed apply: the persisted decision-time red fires green', () => {
    expect(livenessDecisions(report, { [HEARTBEAT]: 'red' })).toEqual([
      { action: 'green', fingerprint: HEARTBEAT, id: 'summer:heartbeat' },
    ]);
  });

  it('still files red for a silent automation on the same lost run', () => {
    const silent = { results: [row('summer:heartbeat', 'unknown')] };
    expect(
      livenessDecisions(silent, lostStatePrevious(args, silent, {}))
    ).toEqual([
      expect.objectContaining({
        action: 'red',
        fingerprint: HEARTBEAT,
      }),
    ]);
  });

  it('stays quiet for a steady green once the state file is restored', () => {
    const steady = { previous: statePath({ [HEARTBEAT]: 'green' }) };
    expect(
      livenessDecisions(
        report,
        lostStatePrevious(steady, report, {
          [HEARTBEAT]: 'green',
        })
      )
    ).toEqual([]);
  });
});
