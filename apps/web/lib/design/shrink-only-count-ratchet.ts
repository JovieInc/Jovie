/**
 * Count-floor policy for shrink-only design-system ratchets.
 *
 * Growth is always a regression. An unbaselined shrink (count dropped, baseline
 * not lowered in the same tree) is authorship debt on a source PR, but it is
 * not a combined-head regression. Native ALLGREEN merge groups run these
 * ratchets on a synthetic stack; a sibling that removed tokens without updating
 * the JSON floor must not fail the group and UNMERGEABLE source-green
 * changelog/UI members (JOV-5300, actions 32602957421).
 *
 * Source `PR Ready` runs only the targeted design debt ratchets through the
 * existing Design Conformance lane (JOV-5301), not the full unit suite.
 * merge_group allows the shrink; local / pull_request fail closed so the PR
 * that changed the count updates the floor before enrollment.
 */

export const SHRINK_ONLY_COUNT_EVENTS = Object.freeze({
  MERGE_GROUP: 'merge_group',
  PULL_REQUEST: 'pull_request',
  LOCAL: 'local',
} as const);

export type ShrinkOnlyCountEvent =
  (typeof SHRINK_ONLY_COUNT_EVENTS)[keyof typeof SHRINK_ONLY_COUNT_EVENTS];

export const SHRINK_ONLY_COUNT_STATUSES = Object.freeze({
  PASS: 'pass',
  REGRESSION: 'regression',
  UNBASELINED_SHRINK: 'unbaselined_shrink',
  SIBLING_SHRINK: 'sibling_shrink',
} as const);

export type ShrinkOnlyCountStatus =
  (typeof SHRINK_ONLY_COUNT_STATUSES)[keyof typeof SHRINK_ONLY_COUNT_STATUSES];

export interface ShrinkOnlyCountInput {
  readonly count: number;
  readonly baseline: number;
  readonly event?: ShrinkOnlyCountEvent;
  readonly metric?: string;
}

export interface ShrinkOnlyCountVerdict {
  readonly ok: boolean;
  readonly status: ShrinkOnlyCountStatus;
  readonly event: ShrinkOnlyCountEvent;
  readonly count: number;
  readonly baseline: number;
  readonly message: string;
}

function isFiniteCount(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Map an event name onto the shrink-only policy.
 *
 * The argument is the source of truth. Explicit `undefined`, empty, or
 * unknown names are `local` and never consult `GITHUB_EVENT_NAME`. A
 * merge_group unit shard must not leak into those cases (JOV-5300).
 * Production callers that want the live GitHub event pass
 * `process.env.GITHUB_EVENT_NAME` themselves.
 */
export function resolveShrinkOnlyCountEvent(
  eventName: string | undefined
): ShrinkOnlyCountEvent {
  if (eventName === SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP) {
    return SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP;
  }
  if (eventName === SHRINK_ONLY_COUNT_EVENTS.PULL_REQUEST) {
    return SHRINK_ONLY_COUNT_EVENTS.PULL_REQUEST;
  }
  return SHRINK_ONLY_COUNT_EVENTS.LOCAL;
}

export function evaluateShrinkOnlyCount(
  input: ShrinkOnlyCountInput
): ShrinkOnlyCountVerdict {
  if (!isFiniteCount(input.count) || !isFiniteCount(input.baseline)) {
    throw new Error(
      `shrink-only count and baseline must be finite numbers; got count=${input.count} baseline=${input.baseline}`
    );
  }

  const event =
    input.event ?? resolveShrinkOnlyCountEvent(process.env.GITHUB_EVENT_NAME);
  const metric = input.metric ?? 'count';
  const { count, baseline } = input;

  if (count > baseline) {
    return {
      ok: false,
      status: SHRINK_ONLY_COUNT_STATUSES.REGRESSION,
      event,
      count,
      baseline,
      message:
        `${metric} grew: ${count} > baseline ${baseline}. ` +
        'Use the canonical tokens instead of adding new debt, or justify a floor raise in review.',
    };
  }

  if (count < baseline) {
    if (event === SHRINK_ONLY_COUNT_EVENTS.MERGE_GROUP) {
      return {
        ok: true,
        status: SHRINK_ONLY_COUNT_STATUSES.SIBLING_SHRINK,
        event,
        count,
        baseline,
        message:
          `${metric} dropped to ${count} (baseline ${baseline}). ` +
          'merge_group allows this unbaselined shrink so a sibling cannot UNMERGEABLE the ALLGREEN group. ' +
          `The PR that changed the count must still lower the baseline to ${count}.`,
      };
    }

    return {
      ok: false,
      status: SHRINK_ONLY_COUNT_STATUSES.UNBASELINED_SHRINK,
      event,
      count,
      baseline,
      message:
        `${metric} dropped to ${count} (baseline ${baseline}). ` +
        `Great — lower the baseline to ${count} in this PR so the ratchet locks in the progress.`,
    };
  }

  return {
    ok: true,
    status: SHRINK_ONLY_COUNT_STATUSES.PASS,
    event,
    count,
    baseline,
    message: '',
  };
}
