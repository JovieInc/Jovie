#!/usr/bin/env tsx
/**
 * agentcookie-sync — Hermes-Air eval/spike job (JOV-3205 / GH-10930)
 *
 * Evaluates what agentcookie would sync from the daily-driver Mac to the
 * Hermes-Air (agent Mac) over Tailscale. Defaults to DRY_RUN mode —
 * nothing is actually synced unless AGENTCOOKIE_LIVE=1 is set.
 *
 * Usage:
 *   # Dry-run (safe — no credentials transferred):
 *   tsx scripts/hermes/jobs/agentcookie-sync.ts
 *
 *   # Live sync (REQUIRES Tim's approval + AGENTCOOKIE_LIVE=1):
 *   AGENTCOOKIE_LIVE=1 tsx scripts/hermes/jobs/agentcookie-sync.ts
 *
 * launchd: co.jovie.hermes.cron-agentcookie-sync
 * Schedule: every 30 minutes (when live mode is enabled by Tim)
 * Node: runs on the SOURCE Mac (daily-driver MBP); pushes to Air.
 */

import {
  checkPrerequisites,
  evaluateSyncCandidates,
  partitionDomains,
  runSync,
} from '../lib/agentcookie';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendTelegram } from '../lib/telegram-client';

const JOB = 'agentcookie-sync';
const DRY_RUN = process.env.AGENTCOOKIE_LIVE !== '1';

// The Tailscale hostname of the Air (agent box). Resolved dynamically if
// AGENTCOOKIE_TARGET_HOST is not set.
const TARGET_HOST = process.env.AGENTCOOKIE_TARGET_HOST ?? 'hermes-air';

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    // 1. Prerequisite check
    const prereqs = await checkPrerequisites();

    logJobEvent({
      job: JOB,
      event: 'prereqs',
      cliInstalled: prereqs.cliInstalled,
      tailscaleConnected: prereqs.tailscaleConnected,
      sourceHost: prereqs.targetHost,
    });

    if (!prereqs.cliInstalled) {
      const msg =
        '[agentcookie-sync] agentcookie CLI not installed.\n' +
        'Install from https://github.com/mvanhorn/agentcookie and re-run.';
      await sendTelegram(msg).catch(() => undefined);
      throw new Error('agentcookie CLI not found');
    }

    if (!prereqs.tailscaleConnected) {
      const msg =
        '[agentcookie-sync] Tailscale is not running — skipping sync.';
      await sendTelegram(msg).catch(() => undefined);
      // Not a hard error: Tailscale may be temporarily disconnected.
      logJobEvent({
        job: JOB,
        event: 'skip',
        reason: 'tailscale-not-connected',
      });
      return;
    }

    // 2. Discover what agentcookie would sync
    let candidates: readonly string[];
    try {
      const evaluation = await evaluateSyncCandidates();
      candidates = evaluation.domains;
      logJobEvent({
        job: JOB,
        event: 'candidates-discovered',
        count: candidates.length,
      });
    } catch (err) {
      // agentcookie list failed — CLI may not be configured yet.
      const msg =
        '[agentcookie-sync] Could not list cookie candidates.\n' +
        `Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
        'Run `agentcookie setup` on the source Mac first.';
      await sendTelegram(msg).catch(() => undefined);
      throw err;
    }

    // 3. Partition against blocklist + allowlist
    const manifest = partitionDomains(candidates);

    logJobEvent({
      job: JOB,
      event: 'manifest',
      eligible: manifest.eligible.length,
      blocked: manifest.blocked.length,
      notInAllowlist: manifest.notInAllowlist.length,
      eligibleDomains: manifest.eligible,
      blockedDomains: manifest.blocked,
    });

    if (manifest.eligible.length === 0) {
      logJobEvent({
        job: JOB,
        event: 'skip',
        reason: 'no-eligible-domains',
      });
      return;
    }

    // 4. Sync (or dry-run)
    const result = await runSync(TARGET_HOST, manifest.eligible, DRY_RUN);

    logJobEvent({
      job: JOB,
      event: 'result',
      ...result,
    });

    // 5. Alert on errors
    if (result.errors.length > 0) {
      const msg =
        `[agentcookie-sync] ${result.errors.length} sync error(s):\n` +
        result.errors.slice(0, 5).join('\n');
      await sendTelegram(msg).catch(() => undefined);
    }

    // 6. Summary notification on live runs
    if (!DRY_RUN && result.synced > 0) {
      const msg =
        `✅ agentcookie-sync: synced ${result.synced} domain(s) to ${TARGET_HOST} ` +
        `in ${result.durationMs}ms`;
      await sendTelegram(msg).catch(() => undefined);
    }

    console.log(
      JSON.stringify(
        {
          mode: DRY_RUN ? 'dry-run' : 'live',
          eligible: manifest.eligible,
          blocked: manifest.blocked.length,
          notInAllowlist: manifest.notInAllowlist.length,
          result,
        },
        null,
        2
      )
    );
  });
}

main().catch(err => {
  console.error('[agentcookie-sync] fatal:', err);
  process.exit(1);
});
