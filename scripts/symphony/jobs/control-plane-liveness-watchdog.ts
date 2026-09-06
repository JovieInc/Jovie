#!/usr/bin/env tsx

/**
 * JOV-6004 slice 1 — control-plane liveness watchdog.
 *
 * Reads the Mac ship-owner lock and the Gem HUD activation attestation,
 * classifies each controller as healthy or dark, and writes a typed receipt
 * to ~/.hermes/state/controller-liveness-latest.json. If a required
 * controller is dark, the receipt authorizes the independent control-plane
 * recovery lane. This job does not mutate Linear, PRs, the merge queue, or
 * deployments.
 */

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildControllerLivenessReceipt,
  CONTROLLER_LIVENESS_STALE_MS,
  readControllerCheckins,
} from '../lib/controller-liveness';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'control-plane-liveness-watchdog';
const RECEIPT_FILE = join(
  HERMES_PATHS.stateDir,
  'controller-liveness-latest.json'
);

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const checkins = readControllerCheckins();
    const receipt = buildControllerLivenessReceipt(checkins, {
      staleAfterMs: CONTROLLER_LIVENESS_STALE_MS,
    });

    mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
    const tmp = `${RECEIPT_FILE}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(receipt, null, 2)}\n`);
    renameSync(tmp, RECEIPT_FILE);

    logJobEvent({
      job: JOB,
      event: 'controller_liveness_checked',
      status: receipt.status,
      violations: receipt.violations.length,
    });

    if (receipt.status === 'dark') {
      logJobEvent({
        job: JOB,
        event: 'recovery_lane_authorized',
        reason: receipt.recoveryLane.reason,
      });
    }
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
