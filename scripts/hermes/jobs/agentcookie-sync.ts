#!/usr/bin/env tsx
/**
 * agentcookie-sync — Hermes-Air health monitor for the cookie/credential receiver.
 *
 * Runs every 15 minutes on the Air. Checks that the agentcookie receiver
 * daemon is alive; notifies via Telegram if it goes dark. Also updates the
 * persisted AgentcookieStatus for HUD consumption.
 *
 * See: scripts/hermes/lib/agentcookie.ts for security policy and config.
 */

import { pathToFileURL } from 'node:url';

import {
  findAgentcookieBin,
  isReceiverRunning,
  readStatus,
  writeStatus,
} from '../lib/agentcookie';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendOpsAlert } from '../lib/ops-notify';

const JOB = 'agentcookie-sync';

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const bin = findAgentcookieBin();
    if (!bin) {
      logJobEvent({ job: JOB, event: 'binary_missing' });
      // Only alert once per day to avoid spam when agentcookie is not yet installed.
      const prev = readStatus();
      const lastAlertAt = (prev as { lastAlertAt?: string }).lastAlertAt;
      const hoursSinceLast = lastAlertAt
        ? (Date.now() - new Date(lastAlertAt).getTime()) / 3_600_000
        : Infinity;
      if (hoursSinceLast > 24) {
        await sendOpsAlert(
          'agentcookie binary not found on Air. Install via bootstrap-air.sh or set AGENTCOOKIE_BIN. ' +
            'Session sync disabled. See GH#10930.'
        );
      }
      writeStatus({
        running: false,
        lastSyncAt: prev.lastSyncAt,
        lastError: 'binary not installed',
        cookieCount: prev.cookieCount,
      });
      return;
    }

    const running = isReceiverRunning();
    const prev = readStatus();

    logJobEvent({ job: JOB, event: 'checked', running });

    if (!running) {
      writeStatus({
        running: false,
        lastSyncAt: prev.lastSyncAt,
        lastError: 'receiver process not running',
        cookieCount: prev.cookieCount,
      });
      // Alert only if we thought it was running before (state flip).
      if (prev.running) {
        await sendOpsAlert(
          'agentcookie receiver stopped on Air. Session sync is offline. ' +
            'Restart: launchctl kickstart -k gui/$(id -u)/co.jovie.hermes.agentcookie-receiver'
        );
      }
      return;
    }

    // Receiver is up: record healthy state.
    writeStatus({
      running: true,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
      cookieCount: prev.cookieCount,
    });
    logJobEvent({ job: JOB, event: 'healthy' });
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(1);
});

// Allow importing for tests without running main().
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // main() already called above via void main()
}
