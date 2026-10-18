/** Evidence policy only. Existing producers own observation, targeting and delivery. */
export const EXPOSURE_SCHEMA = 'jovie.dogfood-exposure/v1' as const;
export type ExposureStatus =
  | 'PASS'
  | 'BLOCKED_BUILD'
  | 'BLOCKED_EXPOSURE'
  | 'UNKNOWN_CONFIGURATION';

export interface ExposureIdentity {
  readonly product: 'jov' | 'lyb' | 'ovie';
  readonly missionId: string;
  /** First-party pseudonymous references, never emails or health traits. */
  readonly actorRef: string;
  readonly accountRef: string;
  readonly sessionRef: string;
  readonly deviceRef: string;
  readonly mode: 'early_access' | 'customer_control';
}

export interface ExposureArtifact {
  readonly buildId: string;
  readonly sourceSha: string;
  readonly backendId: string;
  readonly environment: string;
}

export interface ExpectedExposure {
  readonly schema: typeof EXPOSURE_SCHEMA;
  readonly identity: ExposureIdentity;
  readonly artifact: ExposureArtifact;
  readonly generation: string;
  readonly maxAgeMs: number;
  readonly releaseOwner: string;
  readonly features: readonly {
    readonly key: string;
    readonly value: boolean | string;
    readonly witness: 'rendered' | 'capability';
  }[];
}

export interface ObservedExposure {
  readonly identity: ExposureIdentity;
  readonly artifact: ExposureArtifact;
  readonly observedAt: string;
  readonly membership: {
    readonly eligible: boolean;
    readonly bindingRef: string;
  };
  readonly configuration: {
    readonly generation: string;
    readonly evaluatedAt: string;
    readonly source: 'authoritative' | 'cache' | 'unavailable';
    readonly online: boolean;
  };
  /** All come from existing product authority; release mode grants none of them. */
  readonly boundaries: Readonly<
    Record<
      | 'auth'
      | 'consent'
      | 'entitlement'
      | 'dataIsolation'
      | 'spending'
      | 'killSwitchClear',
      boolean
    >
  >;
  readonly staffOverride: boolean;
  readonly fixtureOverride: boolean;
  readonly syntheticMetricsQuarantined: boolean;
  readonly features: readonly {
    readonly key: string;
    readonly value: boolean | string | null;
    readonly witness: {
      readonly kind: 'rendered' | 'capability';
      readonly visible: boolean;
      readonly executed: boolean;
      readonly evidenceRef: string;
    } | null;
  }[];
}

export interface ExposureEvidence {
  readonly schema: typeof EXPOSURE_SCHEMA;
  readonly expected: ExpectedExposure;
  /** Entry, relevant lifecycle changes, and completion; never dispatch config alone. */
  readonly observations: readonly ObservedExposure[];
  readonly invalidated: boolean;
}

export interface ExposureDecision {
  readonly status: ExposureStatus;
  readonly reasons: readonly string[];
  readonly nextAction:
    | 'none'
    | 'reconcile_authorized_drift'
    | 'release_owner'
    | 'refresh_configuration';
}

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;
const timestamp = (v: unknown) => (text(v) ? Date.parse(v) : Number.NaN);
const keys = <T extends object>(v: T) => Object.keys(v) as (keyof T)[];

export function evaluateExposure(
  expected: ExpectedExposure,
  value: unknown,
  now?: Date
): ExposureDecision {
  const reasons: string[] = [];
  const build: string[] = [];
  const unknown: string[] = [];
  if (
    !record(expected) ||
    expected.schema !== EXPOSURE_SCHEMA ||
    !record(expected.identity) ||
    !record(expected.artifact) ||
    ![
      'product',
      'missionId',
      'actorRef',
      'accountRef',
      'sessionRef',
      'deviceRef',
      'mode',
    ].every(k =>
      text((expected.identity as unknown as Record<string, unknown>)[k])
    ) ||
    !['jov', 'lyb', 'ovie'].includes(expected.identity.product) ||
    !['early_access', 'customer_control'].includes(expected.identity.mode) ||
    !['buildId', 'sourceSha', 'backendId', 'environment'].every(k =>
      text((expected.artifact as unknown as Record<string, unknown>)[k])
    ) ||
    !/^[a-f0-9]{40}$/i.test(expected.artifact.sourceSha) ||
    !text(expected.generation) ||
    !text(expected.releaseOwner) ||
    !Number.isFinite(expected.maxAgeMs) ||
    expected.maxAgeMs <= 0 ||
    !Array.isArray(expected.features) ||
    expected.features.length === 0 ||
    expected.features.some(
      f =>
        !record(f) ||
        !text(f.key) ||
        !['rendered', 'capability'].includes(String(f.witness)) ||
        !(typeof f.value === 'boolean' || text(f.value))
    ) ||
    new Set(expected.features.map(f => f.key)).size !== expected.features.length
  ) {
    return {
      status: 'UNKNOWN_CONFIGURATION',
      reasons: ['invalid_expectation'],
      nextAction: 'refresh_configuration',
    };
  }
  if (
    !record(value) ||
    !record(value.identity) ||
    !record(value.artifact) ||
    !record(value.configuration) ||
    !Array.isArray(value.features)
  ) {
    return {
      status: 'UNKNOWN_CONFIGURATION',
      reasons: ['missing_observation'],
      nextAction: 'refresh_configuration',
    };
  }
  for (const key of keys(expected.identity)) {
    if (value.identity[key] !== expected.identity[key])
      reasons.push(`identity:${key}`);
  }
  for (const key of keys(expected.artifact)) {
    if (value.artifact[key] !== expected.artifact[key])
      build.push(`artifact:${key}`);
  }
  const config = value.configuration;
  const age = timestamp(value.observedAt) - timestamp(config.evaluatedAt);
  const sampleAge = now ? now.getTime() - timestamp(value.observedAt) : 0;
  if (
    !Number.isFinite(sampleAge) ||
    sampleAge < 0 ||
    sampleAge > expected.maxAgeMs ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > expected.maxAgeMs ||
    config.online !== true ||
    !['authoritative', 'cache'].includes(String(config.source)) ||
    config.generation !== expected.generation
  )
    unknown.push('stale_or_unknown_configuration');
  if (
    !record(value.membership) ||
    value.membership.eligible !== true ||
    !text(value.membership.bindingRef)
  )
    reasons.push('unauthorized_membership');
  const boundaries = [
    'auth',
    'consent',
    'entitlement',
    'dataIsolation',
    'spending',
    'killSwitchClear',
  ];
  for (const key of boundaries) {
    if (!record(value.boundaries) || value.boundaries[key] !== true)
      reasons.push(`boundary:${key}`);
  }
  if (value.fixtureOverride !== false) reasons.push('fixture_override');
  if (value.syntheticMetricsQuarantined !== true)
    reasons.push('metrics_not_quarantined');
  if (
    typeof value.staffOverride !== 'boolean' ||
    (expected.identity.mode === 'customer_control' &&
      value.staffOverride !== false)
  )
    reasons.push('staff_override');
  for (const feature of expected.features) {
    const matches = value.features.filter(
      f => record(f) && f.key === feature.key
    );
    const actual = matches.length === 1 ? matches[0] : null;
    if (!record(actual) || actual.value == null) {
      unknown.push(`unevaluated:${feature.key}`);
      continue;
    }
    if (actual.value !== feature.value) reasons.push(`variant:${feature.key}`);
    const witness = actual.witness;
    if (
      !record(witness) ||
      witness.kind !== feature.witness ||
      witness.executed !== true ||
      !text(witness.evidenceRef) ||
      (feature.witness === 'rendered' && witness.visible !== true)
    )
      reasons.push(`unwitnessed:${feature.key}`);
  }
  const status = build.length
    ? 'BLOCKED_BUILD'
    : unknown.length
      ? 'UNKNOWN_CONFIGURATION'
      : reasons.length
        ? 'BLOCKED_EXPOSURE'
        : 'PASS';
  return {
    status,
    reasons: [...build, ...unknown, ...reasons],
    nextAction:
      status === 'BLOCKED_BUILD'
        ? 'release_owner'
        : status === 'UNKNOWN_CONFIGURATION'
          ? 'refresh_configuration'
          : status === 'BLOCKED_EXPOSURE'
            ? reasons.some(r => r.startsWith('unwitnessed:')) &&
              !reasons.some(r => r.startsWith('variant:'))
              ? 'release_owner'
              : 'reconcile_authorized_drift'
            : 'none',
  };
}

/** Evaluate at execution time; callers supply the independently owned mission expectation. */
export function evaluateExposureEvidence(
  expected: ExpectedExposure,
  value: unknown,
  startedAt: string,
  completedAt: string
): ExposureDecision {
  const invalid = (reason: string): ExposureDecision => ({
    status: 'UNKNOWN_CONFIGURATION',
    reasons: [reason],
    nextAction: 'refresh_configuration',
  });
  if (
    !record(value) ||
    value.schema !== EXPOSURE_SCHEMA ||
    !Array.isArray(value.observations) ||
    value.observations.length < 2 ||
    value.invalidated !== false
  )
    return invalid('missing_or_invalidated_exposure');
  const start = timestamp(startedAt);
  const end = timestamp(completedAt);
  const observations = value.observations;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return invalid('invalid_run_time');
  let previous = -Infinity;
  let bindingRef: unknown;
  for (const observation of observations) {
    const result = evaluateExposure(expected, observation);
    if (result.status !== 'PASS') return result;
    const time = timestamp(observation.observedAt);
    if (time < previous || time < start || time > end)
      return invalid('observation_outside_run');
    if (
      bindingRef !== undefined &&
      bindingRef !== observation.membership.bindingRef
    )
      return invalid('membership_changed_during_run');
    bindingRef = observation.membership.bindingRef;
    previous = time;
  }
  if (timestamp(observations[0].observedAt) !== start || previous !== end)
    return invalid('missing_entry_or_completion_observation');
  return { status: 'PASS', reasons: [], nextAction: 'none' };
}

export interface ExposureAdapter {
  observe(): Promise<ObservedExposure>;
  /** Existing approved repair only; never change builds, entitlements or kill switches. */
  reconcile?(): Promise<void>;
  /** Login, account/build/config/cohort changes and revocation invalidate this run. */
  subscribe(invalidate: () => void): () => void;
}

/** Bounded entry/mission guard, called by existing human and automated producers. */
export async function runExposureMission<T>(
  expected: ExpectedExposure,
  adapter: ExposureAdapter,
  mission: () => Promise<T>,
  now: () => Date = () => new Date()
) {
  let invalidated = false;
  const unsubscribe = adapter.subscribe(() => {
    invalidated = true;
  });
  const observations: ObservedExposure[] = [];
  let result: T | undefined;
  try {
    const observe = async () => {
      try {
        return await adapter.observe();
      } catch {
        return null;
      }
    };
    let entry = await observe();
    let decision = evaluateExposure(expected, entry, now());
    if (
      adapter.reconcile &&
      ((decision.status === 'BLOCKED_EXPOSURE' &&
        decision.reasons.some(r => r.startsWith('variant:')) &&
        decision.reasons.every(
          r => r.startsWith('variant:') || r.startsWith('unwitnessed:')
        )) ||
        (decision.status === 'UNKNOWN_CONFIGURATION' &&
          entry?.configuration.source === 'cache' &&
          entry.configuration.online))
    ) {
      try {
        await adapter.reconcile();
      } catch {
        entry = null;
      }
      if (entry) entry = await observe();
      decision = evaluateExposure(expected, entry, now());
    }
    if (entry) observations.push(entry);
    if (decision.status === 'PASS' && !invalidated && entry) {
      result = await mission();
      const completion = await observe();
      if (completion) observations.push(completion);
      const completionDecision = evaluateExposure(expected, completion, now());
      decision =
        completionDecision.status !== 'PASS'
          ? completionDecision
          : evaluateExposureEvidence(
              expected,
              { schema: EXPOSURE_SCHEMA, observations, invalidated },
              entry.observedAt,
              completion?.observedAt ?? ''
            );
    } else if (invalidated) {
      decision = {
        status: 'UNKNOWN_CONFIGURATION',
        reasons: ['entry_invalidated'],
        nextAction: 'refresh_configuration',
      };
    }
    return {
      decision,
      result,
      exposure: {
        schema: EXPOSURE_SCHEMA,
        expected,
        observations,
        invalidated,
      } satisfies ExposureEvidence,
    };
  } finally {
    unsubscribe();
  }
}
