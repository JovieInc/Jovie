import type { DeliveryLanes } from '@/lib/ovie/shipping-state/contract';
import { operatorAlertCopy } from './operator-copy';

export type FleetVerdictLevel = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface FleetVerdict {
  readonly level: FleetVerdictLevel;
  /** One sentence Tim can act on: the level, the top reason, how many more. */
  readonly headline: string;
  /** Every distinct reason in operator copy, worst first. */
  readonly reasons: readonly string[];
  /** "2 of 3 lanes running", or null when the feed did not measure it. */
  readonly capacity: string | null;
}

function measured(count: DeliveryLanes['running']): number | null {
  return count.state === 'not-measured' ? null : count.value;
}

/**
 * One verdict for fleet health. Home used to show a doctor alert ("57 failed
 * delivery records") beside a lane ratio ("2/3") with nothing joining them, so
 * "is the fleet healthy?" had two half-answers. The verdict is the join:
 *   down      the lanes feed is stale (the host stopped reporting)
 *   degraded  the feed is current but publishes alerts
 *   unknown   nothing measured yet (never reads as healthy)
 *   healthy   current feed, no alerts
 */
export function fleetVerdict(lanes: DeliveryLanes): FleetVerdict {
  const running = measured(lanes.running);
  const slots = measured(lanes.slots);
  const capacity =
    running !== null && slots !== null
      ? `${running} of ${slots} ${slots === 1 ? 'lane' : 'lanes'} running`
      : null;

  const reasons = [
    ...new Set(
      lanes.alerts
        .filter(alert => alert.trim().length > 0)
        .map(alert => operatorAlertCopy(alert))
    ),
  ];

  if (lanes.stale) {
    return {
      level: 'down',
      headline: 'Fleet not reporting: the lanes feed is stale',
      reasons: ['The lanes feed is stale', ...reasons],
      capacity,
    };
  }
  if (reasons.length > 0) {
    const more = reasons.length > 1 ? ` (+${reasons.length - 1} more)` : '';
    return {
      level: 'degraded',
      headline: `Fleet degraded: ${reasons[0]}${more}`,
      reasons,
      capacity,
    };
  }
  if (running === null && slots === null) {
    return {
      level: 'unknown',
      headline: 'Fleet health not measured',
      reasons: [],
      capacity,
    };
  }
  return {
    level: 'healthy',
    headline: capacity ? `Fleet healthy: ${capacity}` : 'Fleet healthy',
    reasons: [],
    capacity,
  };
}
