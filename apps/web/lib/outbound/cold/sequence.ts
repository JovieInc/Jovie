/**
 * Cold outreach follow-up sequence (outreach engine, phase 1).
 *
 * Three touches at most: the first email, one that adds something new, and a
 * short last check-in. Any reply, claim, unsubscribe, bounce, complaint or
 * suppression on any stream ends the thread for good. Pure: the caller
 * supplies the thread's history and the clock.
 */

export const COLD_SEQUENCE_VERSION = 'cold-seq/v1';

export type ColdStepKind = 'first_touch' | 'new_value' | 'check_in';

export interface ColdSequenceStep {
  readonly index: number;
  readonly kind: ColdStepKind;
  /** Days after the previous sent step. The first step is due at once. */
  readonly delayDays: number;
}

export const COLD_SEQUENCE: readonly ColdSequenceStep[] = Object.freeze([
  { index: 0, kind: 'first_touch', delayDays: 0 },
  { index: 1, kind: 'new_value', delayDays: 4 },
  { index: 2, kind: 'check_in', delayDays: 6 },
]);

/** Events that end a thread. Every one is permanent for that recipient. */
export const COLD_STOP_EVENTS = [
  'replied',
  'claimed',
  'unsubscribed',
  'bounced',
  'complained',
  'suppressed',
  'rejected',
] as const;
export type ColdStopEvent = (typeof COLD_STOP_EVENTS)[number];

export interface ColdThreadHistory {
  /** Sent steps, any order. */
  readonly sent: readonly { readonly index: number; readonly at: Date }[];
  /** Stop events seen for this recipient on any stream. */
  readonly stops: readonly {
    readonly event: ColdStopEvent;
    readonly at: Date;
  }[];
}

export type ColdNextStep =
  | { readonly kind: 'due'; readonly step: ColdSequenceStep }
  | {
      readonly kind: 'waiting';
      readonly step: ColdSequenceStep;
      readonly dueAt: Date;
    }
  | { readonly kind: 'stopped'; readonly reason: ColdStopEvent }
  | { readonly kind: 'complete' };

const DAY_MS = 86_400_000;

/** What the thread does next. A stop event always wins over a due step. */
export function nextColdStep(
  history: ColdThreadHistory,
  now: Date
): ColdNextStep {
  const firstStop = [...history.stops].sort(
    (a, b) => a.at.getTime() - b.at.getTime()
  )[0];
  if (firstStop) return { kind: 'stopped', reason: firstStop.event };

  const sentIndexes = new Set(history.sent.map(item => item.index));
  const next = COLD_SEQUENCE.find(step => !sentIndexes.has(step.index));
  if (!next) return { kind: 'complete' };
  if (next.index === 0) return { kind: 'due', step: next };

  const previous = history.sent
    .filter(item => item.index === next.index - 1)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  // A gap in the history means the earlier step never left; do not skip it.
  if (!previous) return { kind: 'complete' };
  const dueAt = new Date(previous.at.getTime() + next.delayDays * DAY_MS);
  return dueAt.getTime() <= now.getTime()
    ? { kind: 'due', step: next }
    : { kind: 'waiting', step: next, dueAt };
}
