export const INSTINCT_PILOT_BACKPRESSURE_SCHEMA =
  'jovie.instinct.pilot-backpressure/v1' as const;
export const INSTINCT_PILOT_TRACKING_KEY =
  'INSTINCT-ARTIST-2026-09-23/pilot' as const;

export const INSTINCT_PILOT_LIMITS = {
  activeObjectives: 1,
  parkedObservationCases: 3,
  capabilityWorkSlots: 1,
  queuedCapabilityRequests: 2,
  proposalsPerRollingDay: 1,
  callsPerEpisode: 20,
  callsPerRollingDay: 200,
  maxRetryAttempts: 3,
} as const;

const DAY_MS = 86_400_000;
const RETRY_BASE_MS = 1_000;
const RETRY_CAP_MS = 60_000;
const JITTER_SPAN_MS = 1_000;

export type PilotDenyReason =
  | 'active-objective-occupied'
  | 'mission-stopped'
  | 'parked-cases-full'
  | 'capability-slot-occupied'
  | 'capability-queue-full'
  | 'proposal-budget-exhausted'
  | 'episode-budget-exhausted'
  | 'daily-budget-exhausted'
  | 'episode-unknown'
  | 'retry-exhausted'
  | 'retry-not-permitted';

export type FailureKind = 'transient' | 'nontransient' | 'uncertain-mutation';

export type ObservationCase = {
  readonly key: string;
  readonly owner: string;
  readonly nextCheckAt: number;
  readonly horizonEndsAt: number;
};

export type PilotEpisode = {
  readonly id: string;
  readonly startedAt: number;
  readonly calls: number;
};

export type RetryRecord = {
  readonly operationKey: string;
  readonly attempts: number;
  readonly lastFailureKind: FailureKind;
  readonly nextAttemptAt: number;
};

export type PilotBackpressureState = {
  readonly schema: typeof INSTINCT_PILOT_BACKPRESSURE_SCHEMA;
  readonly trackingKey: typeof INSTINCT_PILOT_TRACKING_KEY;
  readonly activeObjectiveKey: string | null;
  readonly stoppedMissionKeys: readonly string[];
  readonly parkedCases: readonly ObservationCase[];
  readonly capabilitySlotKey: string | null;
  readonly capabilityQueue: readonly string[];
  readonly proposalTimestamps: readonly number[];
  readonly episodes: Readonly<Record<string, PilotEpisode>>;
  readonly callTimestamps: readonly number[];
  readonly retries: Readonly<Record<string, RetryRecord>>;
};

export type PilotResult<T = undefined> =
  | {
      readonly ok: true;
      readonly state: PilotBackpressureState;
      readonly value?: T;
    }
  | { readonly ok: false; readonly reason: PilotDenyReason };

export function initialPilotBackpressureState(): PilotBackpressureState {
  return {
    schema: INSTINCT_PILOT_BACKPRESSURE_SCHEMA,
    trackingKey: INSTINCT_PILOT_TRACKING_KEY,
    activeObjectiveKey: null,
    stoppedMissionKeys: [],
    parkedCases: [],
    capabilitySlotKey: null,
    capabilityQueue: [],
    proposalTimestamps: [],
    episodes: {},
    callTimestamps: [],
    retries: {},
  };
}

function prune(
  state: PilotBackpressureState,
  now: number
): PilotBackpressureState {
  const floor = now - DAY_MS;
  return {
    ...state,
    proposalTimestamps: state.proposalTimestamps.filter(t => t > floor),
    callTimestamps: state.callTimestamps.filter(t => t > floor),
  };
}

export function admitObjective(
  state: PilotBackpressureState,
  canonicalKey: string
): PilotResult {
  if (state.stoppedMissionKeys.includes(canonicalKey)) {
    return { ok: false, reason: 'mission-stopped' };
  }
  if (state.activeObjectiveKey !== null) {
    return { ok: false, reason: 'active-objective-occupied' };
  }
  return {
    ok: true,
    state: { ...state, activeObjectiveKey: canonicalKey },
  };
}

export function releaseObjective(
  state: PilotBackpressureState,
  canonicalKey: string
): PilotBackpressureState {
  if (state.activeObjectiveKey !== canonicalKey) return state;
  return { ...state, activeObjectiveKey: null };
}

export function stopMission(
  state: PilotBackpressureState,
  canonicalKey: string
): PilotBackpressureState {
  const stopped = state.stoppedMissionKeys.includes(canonicalKey)
    ? state.stoppedMissionKeys
    : [...state.stoppedMissionKeys, canonicalKey];
  return {
    ...state,
    stoppedMissionKeys: stopped,
    activeObjectiveKey:
      state.activeObjectiveKey === canonicalKey
        ? null
        : state.activeObjectiveKey,
  };
}

export function parkObservationCase(
  state: PilotBackpressureState,
  entry: ObservationCase
): PilotResult {
  const existing = state.parkedCases.findIndex(c => c.key === entry.key);
  if (existing >= 0) {
    const parkedCases = state.parkedCases.slice();
    parkedCases[existing] = entry;
    return { ok: true, state: { ...state, parkedCases } };
  }
  if (
    state.parkedCases.length >= INSTINCT_PILOT_LIMITS.parkedObservationCases
  ) {
    return { ok: false, reason: 'parked-cases-full' };
  }
  return {
    ok: true,
    state: { ...state, parkedCases: [...state.parkedCases, entry] },
  };
}

export function unparkObservationCase(
  state: PilotBackpressureState,
  key: string
): PilotBackpressureState {
  return {
    ...state,
    parkedCases: state.parkedCases.filter(c => c.key !== key),
  };
}

export function acquireCapabilitySlot(
  state: PilotBackpressureState,
  capabilityKey: string
): PilotResult {
  if (state.capabilitySlotKey !== null) {
    if (state.capabilitySlotKey === capabilityKey) {
      return { ok: true, state };
    }
    return { ok: false, reason: 'capability-slot-occupied' };
  }
  const capabilityQueue = state.capabilityQueue.filter(
    k => k !== capabilityKey
  );
  return {
    ok: true,
    state: { ...state, capabilitySlotKey: capabilityKey, capabilityQueue },
  };
}

export function releaseCapabilitySlot(
  state: PilotBackpressureState,
  capabilityKey: string
): PilotBackpressureState {
  if (state.capabilitySlotKey !== capabilityKey) return state;
  return { ...state, capabilitySlotKey: null };
}

export function enqueueCapabilityRequest(
  state: PilotBackpressureState,
  capabilityKey: string
): PilotResult {
  if (
    state.capabilitySlotKey === capabilityKey ||
    state.capabilityQueue.includes(capabilityKey)
  ) {
    return { ok: true, state };
  }
  if (
    state.capabilityQueue.length >=
    INSTINCT_PILOT_LIMITS.queuedCapabilityRequests
  ) {
    return { ok: false, reason: 'capability-queue-full' };
  }
  return {
    ok: true,
    state: {
      ...state,
      capabilityQueue: [...state.capabilityQueue, capabilityKey],
    },
  };
}

export function recordProposal(
  state: PilotBackpressureState,
  now: number
): PilotResult {
  const pruned = prune(state, now);
  if (
    pruned.proposalTimestamps.length >=
    INSTINCT_PILOT_LIMITS.proposalsPerRollingDay
  ) {
    return { ok: false, reason: 'proposal-budget-exhausted' };
  }
  return {
    ok: true,
    state: {
      ...pruned,
      proposalTimestamps: [...pruned.proposalTimestamps, now],
    },
  };
}

export function beginEpisode(
  state: PilotBackpressureState,
  episodeId: string,
  now: number
): PilotResult {
  if (state.episodes[episodeId]) {
    return { ok: true, state };
  }
  return {
    ok: true,
    state: {
      ...state,
      episodes: {
        ...state.episodes,
        [episodeId]: { id: episodeId, startedAt: now, calls: 0 },
      },
    },
  };
}

export function recordCall(
  state: PilotBackpressureState,
  episodeId: string,
  now: number
): PilotResult {
  const episode = state.episodes[episodeId];
  if (!episode) return { ok: false, reason: 'episode-unknown' };
  if (episode.calls >= INSTINCT_PILOT_LIMITS.callsPerEpisode) {
    return { ok: false, reason: 'episode-budget-exhausted' };
  }
  const pruned = prune(state, now);
  if (
    pruned.callTimestamps.length >= INSTINCT_PILOT_LIMITS.callsPerRollingDay
  ) {
    return { ok: false, reason: 'daily-budget-exhausted' };
  }
  return {
    ok: true,
    state: {
      ...pruned,
      callTimestamps: [...pruned.callTimestamps, now],
      episodes: {
        ...pruned.episodes,
        [episodeId]: { ...episode, calls: episode.calls + 1 },
      },
    },
  };
}

function jitterFor(operationKey: string, attempt: number): number {
  let hash = 0x811c9dc5;
  const input = `${operationKey}#${attempt}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % JITTER_SPAN_MS;
}

export function planRetry(
  state: PilotBackpressureState,
  operationKey: string,
  failure: {
    readonly kind: FailureKind;
    readonly retryAfterMs?: number;
  },
  now: number
): PilotResult<{ readonly attempt: number; readonly nextAttemptAt: number }> {
  if (failure.kind !== 'transient') {
    return { ok: false, reason: 'retry-not-permitted' };
  }
  const prior = state.retries[operationKey];
  const attempt = (prior?.attempts ?? 0) + 1;
  if (attempt > INSTINCT_PILOT_LIMITS.maxRetryAttempts) {
    return { ok: false, reason: 'retry-exhausted' };
  }
  const backoff = Math.min(
    RETRY_BASE_MS * 2 ** (attempt - 1) + jitterFor(operationKey, attempt),
    RETRY_CAP_MS
  );
  const nextAttemptAt = now + Math.max(backoff, failure.retryAfterMs ?? 0);
  return {
    ok: true,
    state: {
      ...state,
      retries: {
        ...state.retries,
        [operationKey]: {
          operationKey,
          attempts: attempt,
          lastFailureKind: failure.kind,
          nextAttemptAt,
        },
      },
    },
    value: { attempt, nextAttemptAt },
  };
}

export function clearRetry(
  state: PilotBackpressureState,
  operationKey: string
): PilotBackpressureState {
  if (!state.retries[operationKey]) return state;
  const retries = { ...state.retries };
  delete retries[operationKey];
  return { ...state, retries };
}

export function serializePilotState(state: PilotBackpressureState): string {
  return JSON.stringify(state);
}

export function restorePilotState(
  raw: string,
  now: number
): PilotBackpressureState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PilotBackpressureState> | null;
    if (
      !parsed ||
      parsed.schema !== INSTINCT_PILOT_BACKPRESSURE_SCHEMA ||
      parsed.trackingKey !== INSTINCT_PILOT_TRACKING_KEY ||
      !Array.isArray(parsed.stoppedMissionKeys) ||
      !Array.isArray(parsed.parkedCases) ||
      !Array.isArray(parsed.capabilityQueue) ||
      !Array.isArray(parsed.proposalTimestamps) ||
      !Array.isArray(parsed.callTimestamps) ||
      typeof parsed.episodes !== 'object' ||
      parsed.episodes === null ||
      typeof parsed.retries !== 'object' ||
      parsed.retries === null
    ) {
      return null;
    }
    return prune(parsed as PilotBackpressureState, now);
  } catch {
    return null;
  }
}
