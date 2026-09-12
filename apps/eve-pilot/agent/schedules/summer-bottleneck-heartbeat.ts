import { defineSchedule } from 'eve/schedules';
import {
  reconcileMissedSummerBottleneckEvents,
  type SummerBottleneckDependencies,
} from '../lib/summer-bottleneck-loop';
import {
  type GemDarkRecoveryCycleResult,
  loadRunnerSourceAttestationFromEnvironment,
  runGemDarkRecoveryCycle,
} from '../lib/summer-gem-dark-recovery';
import { dispatchSummerGovernedRequest } from '../lib/summer-governed-dispatch';
import { createVercelBlobBottleneckDependencies } from '../lib/vercel-blob-bottleneck-runtime';

/** Heartbeat decision job for JOV-6163 governed routing. */
function heartbeatDecisionJob(now: Date) {
  return {
    kind: 'decision' as const,
    id: `summer-heartbeat:${now.toISOString().slice(0, 13)}`,
    jobClass: 'ambiguous-product-reasoning' as const,
    riskTier: 'medium' as const,
    objective:
      'Resolve Summer heartbeat routing under JOV-6163 attestation policy',
    requiredCapabilities: ['reasoning', 'product'],
    certificationPredicate: 'source-bound-signed-rate-limited',
    authority: 'automation' as const,
    evidenceRefs: ['summer-heartbeat', 'jov-6163'],
  };
}

export async function runSummerBottleneckHeartbeat(
  dependencies: SummerBottleneckDependencies = createVercelBlobBottleneckDependencies()
) {
  const bottleneck = await reconcileMissedSummerBottleneckEvents(dependencies);

  // JOV-6163 repair-to-runtime bridge: request outcome → governor route launch.
  // Fresh attestation → Symphony remains authoritative. Attestation unavailable
  // / explicit Gem-dark → Cursor isolated-recovery request (never Gem). Unknown
  // (no probe) → hold; do not auto-spend Cursor.
  //
  // Attestation freshness uses wall-clock (Date.now) inside resolveGemDarkTrigger;
  // do not pin nowMs to dependencies.now() here or CI receipts keyed to Date.now()
  // will look "from the future" vs a fixed dependency clock.
  const attestationReceipt = await loadRunnerSourceAttestationFromEnvironment();
  const now = dependencies.now();
  const governedDispatch = dispatchSummerGovernedRequest({
    decisionJob: heartbeatDecisionJob(now),
    environment: process.env,
    attestationReceipt,
  });
  const gemDarkTrigger = governedDispatch.trigger;

  let gemDarkRecovery: GemDarkRecoveryCycleResult;
  if (governedDispatch.outcome === 'cursor-recovery-request') {
    gemDarkRecovery = await runGemDarkRecoveryCycle(
      {
        store: dependencies.store,
        isGemDark: () => true,
        cursorApiKey: process.env.CURSOR_API_KEY,
        repository:
          process.env.SUMMER_RECOVERY_REPOSITORY ??
          'https://github.com/JovieInc/Jovie',
      },
      {
        objective:
          gemDarkTrigger.reason === 'runner-source-attestation-unavailable'
            ? 'Runner-source attestation unavailable/stale — prepare isolated JOV-6163 publisher recovery artifacts without live Gem mutation'
            : 'Gem dark — prepare isolated attestation/publisher recovery artifacts without live Gem mutation',
        evidenceRefs: [
          'summer-heartbeat:gem-dark-or-attestation-probe',
          `gem-dark-trigger:${gemDarkTrigger.reason}`,
          `governed-dispatch:${governedDispatch.outcome}`,
          `recovery-job:${governedDispatch.recoveryJobId}`,
          ...(gemDarkTrigger.attestation?.status === 'unavailable'
            ? [
                'runner-source-attestation-unavailable',
                `attestation-reason:${gemDarkTrigger.attestation.reason}`,
              ]
            : []),
        ],
        idempotencyKey: `gem-dark-${now.toISOString().slice(0, 13)}`,
        launch: Boolean(process.env.CURSOR_API_KEY),
      }
    );
  } else {
    // symphony-route or hold — never open Cursor outbox from this path
    gemDarkRecovery = { status: 'skipped', reason: 'gem-live' };
  }

  return {
    bottleneck,
    gemDarkTrigger,
    gemDarkRecovery,
    governedDispatch,
  };
}

export default defineSchedule({
  cron: '*/15 * * * *',
  run({ waitUntil }) {
    // Event ingress is the primary engine. This cadence recovers durable events
    // that lack a terminal receipt and, when governed dispatch selects Cursor
    // recovery (Gem dark / attestation unavailable), advances the outbox.
    waitUntil(runSummerBottleneckHeartbeat());
  },
});
