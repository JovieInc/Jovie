import { defineSchedule } from 'eve/schedules';
import {
  reconcileMissedSummerBottleneckEvents,
  type SummerBottleneckDependencies,
} from '../lib/summer-bottleneck-loop';
import { createVercelBlobBottleneckDependencies } from '../lib/vercel-blob-bottleneck-runtime';

export async function runSummerBottleneckHeartbeat(
  dependencies: SummerBottleneckDependencies = createVercelBlobBottleneckDependencies()
) {
  return reconcileMissedSummerBottleneckEvents(dependencies);
}

export default defineSchedule({
  cron: '*/15 * * * *',
  run({ waitUntil }) {
    // Event ingress is the primary engine. This cadence only recovers durable
    // events that lack a terminal receipt after a crash or missed handoff.
    waitUntil(runSummerBottleneckHeartbeat());
  },
});
