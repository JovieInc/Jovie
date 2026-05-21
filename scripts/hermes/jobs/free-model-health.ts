#!/usr/bin/env tsx
/**
 * Free-Model Health Probe — Hermes-Air
 *
 * Nightly: pings every ranked free model with a tiny "reply OK" prompt.
 * Updates ~/.hermes/state/model-router-rankings.json with success/failure
 * outcomes so the router prefers reliably-free models.
 *
 * Side effect: detects "promo" models that silently flip to paid. Those
 * are ejected by free-model-router (cost detection); this job records the
 * ejection in the rankings.
 */

import { listRankings, probeModel } from '../lib/free-model-router';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'free-model-health';

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const rankings = listRankings();
    const results: Array<{
      id: string;
      ok: boolean;
      latencyMs: number;
      error?: string;
    }> = [];
    for (const model of rankings.models) {
      const probe = await probeModel(model.id);
      results.push({ id: model.id, ...probe });
      logJobEvent({
        job: JOB,
        event: 'probed',
        model: model.id,
        ok: probe.ok,
        latencyMs: probe.latencyMs,
        error: probe.error,
      });
    }
    const okCount = results.filter(r => r.ok).length;
    logJobEvent({
      job: JOB,
      event: 'summary',
      total: results.length,
      ok: okCount,
      failed: results.length - okCount,
    });
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  process.exit(0);
});
