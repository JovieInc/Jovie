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
 * Source `PR Ready` does not run unit tests. Growth is blocked at enrollment
 * by the cheap `design-system-source-ratchet` ci-fast lane (JOV-5301).
 * Fail-closed baseline updates for unbaselined shrink still cannot be required
 * at enrollment without expanding that gate. merge_group allows the shrink;
 * local / pull_request still fail closed so the PR that changed the count
 * updates the floor when the unit test actually runs.
 *
 * Provenance: that same merge_group leniency can land a shrink with the floor
 * left stale on main. Without attribution every later branch off that base
 * fails its own local / pull_request run for debt it did not author
 * (JOV-5326). When the caller supplies `baseCount` — the count measured at the
 * merge-base — a below-baseline count only fails when this tree actually
 * removed occurrences (`count < baseCount`). If the base was already under the
 * floor the verdict is `inherited_shrink`: it passes, because the stale floor
 * belongs to the removal owner's lane, not to unrelated diffs.
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
  INHERITED_SHRINK: 'inherited_shrink',
} as const);

export type ShrinkOnlyCountStatus =
  (typeof SHRINK_ONLY_COUNT_STATUSES)[keyof typeof SHRINK_ONLY_COUNT_STATUSES];

export interface ShrinkOnlyCountInput {
  readonly count: number;
  readonly baseline: number;
  /**
   * Count measured at the tree's merge-base, when the caller can resolve one.
   * Below-baseline counts fail closed while this is unknown (JOV-5326).
   */
  readonly baseCount?: number;
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
  if (
    !isFiniteCount(input.count) ||
    !isFiniteCount(input.baseline) ||
    (input.baseCount !== undefined && !isFiniteCount(input.baseCount))
  ) {
    throw new Error(
      `shrink-only count and baseline must be finite numbers; got count=${input.count} baseline=${input.baseline} baseCount=${input.baseCount}`
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

    if (input.baseCount !== undefined && count >= input.baseCount) {
      return {
        ok: true,
        status: SHRINK_ONLY_COUNT_STATUSES.INHERITED_SHRINK,
        event,
        count,
        baseline,
        message:
          `${metric} is ${count}, below baseline ${baseline}, but the ` +
          `merge-base already measures ${input.baseCount} — this tree did not ` +
          'author the shrink, so the stale floor is inherited (JOV-5326). ' +
          `The removal owner's lane should still lower the baseline to ${input.baseCount}.`,
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
