import { defineSchedule } from 'eve/schedules';
import {
  runSummerLivenessHeartbeat,
  SUMMER_LIVENESS_HEARTBEAT_CADENCE,
  type SummerLivenessHeartbeatDependencies,
  summerLivenessHeartbeatFromEnvironment,
} from '../lib/summer-liveness-heartbeat';

/**
 * Eve-owned Summer liveness trigger. This is not backlog rerank.
 * Ranking stays event-driven only (land/CI/signal/founder/GSC/intake).
 */
export async function emitSummerLivenessHeartbeat(
  dependencies: SummerLivenessHeartbeatDependencies = summerLivenessHeartbeatFromEnvironment()
) {
  return runSummerLivenessHeartbeat(dependencies);
}

export default defineSchedule({
  cron: SUMMER_LIVENESS_HEARTBEAT_CADENCE,
  run({ waitUntil }) {
    waitUntil(emitSummerLivenessHeartbeat());
  },
});
