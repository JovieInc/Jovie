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
//
// JOV-9006 extension, observed 2026-11-14 12:53-13:01Z: the 403 does not
// always leave the state file missing. The restore step's
// `unzip -p liveness/prior.zip state.json > liveness/state.json 2>/dev/null
// || true` creates a 0-byte `liveness/state.json` when the download fails
// (the `>` redirect truncates the target into existence), and a bare
// existsSync check counted that empty file as a restored state. The 12:53
// run filed `automation-liveness-gem-lanes-tick` red (ok); the 12:59 run's
// restore 403'd, so the empty file suppressed the reconciliation, the run
// emitted no green decision for the already-recovered row, and it persisted
// a state rebuilt from nothing (the fingerprint flipped to green without a
// resolution) — stranding the open alert with no later retry. An empty state
// file must reconcile exactly like a missing one.

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
  if (withState === 'empty') writeFileSync(path, '');
  else if (withState) writeFileSync(path, `${JSON.stringify(withState)}\n`);
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

  it("records 'red' when the restore left a 0-byte state file (JOV-9006)", () => {
    // The workflow's `> liveness/state.json` redirect creates the file even
    // when the download behind `|| true` failed, so a bare existsSync check
    // misread the empty file as a restored state and dropped the red -> green
    // resolution for automation-liveness-gem-lanes-tick on 2026-11-14.
    const args = { previous: statePath('empty') };
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

  it('treats a 0-byte state file exactly like a missing one', () => {
    const report = { results: [row('summer:heartbeat', 'fresh')] };
    expect(
      lostStatePrevious({ previous: statePath('empty') }, report, {})
    ).toEqual(lostStatePrevious({ previous: statePath(false) }, report, {}));
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

  it('fires the green resolution when the restore left a 0-byte state file (JOV-9006)', () => {
    // Pre-fix, the 2026-11-14T12:59Z liveness run after the gem:lanes-tick red
    // produced no decision here: the empty file counted as restored state, so
    // the recovered row had no recorded red to resolve and the open alert was
    // stranded permanently.
    const emptied = { previous: statePath('empty') };
    expect(
      livenessDecisions(report, lostStatePrevious(emptied, report, {}))
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
