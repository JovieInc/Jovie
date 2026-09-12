import { defineSchedule } from 'eve/schedules';
import {
  loadRunnerSourceAttestationFromEnvironment,
  resolveGemDarkTrigger,
  runGemDarkRecoveryCycle,
} from '../lib/summer-gem-dark-recovery';
import {
  reconcileMissedSummerBottleneckEvents,
  type SummerBottleneckDependencies,
} from '../lib/summer-bottleneck-loop';
import { createVercelBlobBottleneckDependencies } from '../lib/vercel-blob-bottleneck-runtime';

export async function runSummerBottleneckHeartbeat(
  dependencies: SummerBottleneckDependencies = createVercelBlobBottleneckDependencies()
) {
  const bottleneck = await reconcileMissedSummerBottleneckEvents(dependencies);

  // JOV-6163 repair-to-runtime bridge: when runner-source attestation is
  // missing/stale (or SUMMER_GEM_DARK is explicit), Summer requests isolated
  // recovery through the governor-selected Cursor outbox instead of waiting on
  // symphony/gem. Fresh attestation keeps the normal symphony path authoritative.
  const attestationReceipt = await loadRunnerSourceAttestationFromEnvironment();
  const gemDarkTrigger = resolveGemDarkTrigger({
    environment: process.env,
    attestationReceipt,
  });

  const gemDarkRecovery = await runGemDarkRecoveryCycle(
    {
      store: dependencies.store,
      isGemDark: () => gemDarkTrigger.dark,
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
        ...(gemDarkTrigger.attestation?.status === 'unavailable'
          ? [
              'runner-source-attestation-unavailable',
              `attestation-reason:${gemDarkTrigger.attestation.reason}`,
            ]
          : []),
      ],
      idempotencyKey: `gem-dark-${new Date().toISOString().slice(0, 13)}`,
      launch: Boolean(process.env.CURSOR_API_KEY),
    }
  );

  return { bottleneck, gemDarkTrigger, gemDarkRecovery };
}

export default defineSchedule({
  cron: '*/15 * * * *',
  run({ waitUntil }) {
    // Event ingress is the primary engine. This cadence recovers durable events
    // that lack a terminal receipt and, when Gem is dark or runner-source
    // attestation is unavailable, advances the governor-routed Cursor outbox.
    waitUntil(runSummerBottleneckHeartbeat());
  },
});
