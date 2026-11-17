import { writeFileSync } from 'node:fs';
import { frameDigest } from './frame-identity.mjs';

export const MAX_SWEEP_ATTEMPTS = 3;

/** Persist failures as well as receipts so restarts cannot reset the retry budget. */
export function recordSweepAttempt(sweep, id, receipt) {
  if (!sweep) return;
  const digest =
    receipt.digestAfter ?? frameDigest(sweep.trees.find(t => t.id === id));
  const previous = sweep.state[id];
  sweep.state[id] = {
    digest,
    verdict: receipt.verdict,
    attempts: (previous?.digest === digest ? (previous.attempts ?? 0) : 0) + 1,
    at: new Date().toISOString(),
  };
  writeFileSync(sweep.statePath, `${JSON.stringify(sweep.state, null, 2)}\n`);
}
