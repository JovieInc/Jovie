import { defineSchedule } from 'eve/schedules';
import {
  reconcileMissedSummerBottleneckEvents,
  type SummerBottleneckDependencies,
} from '../lib/summer-bottleneck-loop';
import {
  isGemDarkFromEnvironment,
  runGemDarkRecoveryCycle,
} from '../lib/summer-gem-dark-recovery';
import { createVercelBlobBottleneckDependencies } from '../lib/vercel-blob-bottleneck-runtime';

export async function runSummerBottleneckHeartbeat(
  dependencies: SummerBottleneckDependencies = createVercelBlobBottleneckDependencies()
) {
  const bottleneck = await reconcileMissedSummerBottleneckEvents(dependencies);

  // When Gem is explicitly dark, Summer requests isolated recovery through the
  // governor-selected Cursor outbox instead of waiting on symphony/gem.
  const gemDarkRecovery = await runGemDarkRecoveryCycle(
    {
      store: dependencies.store,
      isGemDark: () => isGemDarkFromEnvironment(),
      cursorApiKey: process.env.CURSOR_API_KEY,
      repository:
        process.env.SUMMER_RECOVERY_REPOSITORY ??
        'https://github.com/JovieInc/Jovie',
    },
    {
      objective:
        'Gem dark — prepare isolated attestation/publisher recovery artifacts without live Gem mutation',
      evidenceRefs: [
        'summer-heartbeat:gem-dark',
        'runner-source-attestation-unavailable',
      ],
      idempotencyKey: `gem-dark-${new Date().toISOString().slice(0, 13)}`,
      launch: Boolean(process.env.CURSOR_API_KEY),
    }
  );

  return { bottleneck, gemDarkRecovery };
}

export default defineSchedule({
  cron: '*/15 * * * *',
  run({ waitUntil }) {
    // Event ingress is the primary engine. This cadence recovers durable events
    // that lack a terminal receipt and, when Gem is dark, advances the
    // governor-routed Cursor recovery outbox.
    waitUntil(runSummerBottleneckHeartbeat());
  },
});
