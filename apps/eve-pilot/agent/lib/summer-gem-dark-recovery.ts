/**
 * Summer Gem-dark recovery cycle.
 *
 * When Gem is dark, Summer requests an isolated recovery outcome through the
 * canonical governor (Cursor Cloud). The durable outbox is the launch surface —
 * Summer does not spawn workers inline from conversation tools.
 */

import {
  buildCursorRecoveryOutbox,
  buildGemDarkExerciseReport,
  type CursorRecoveryOutboxRecord,
  type CursorRecoveryReceipt,
  createIsolatedRecoveryJob,
  disposeGemDarkRecovery,
  type RecoveryAdmissionContext,
  requestCursorIsolatedRecovery,
} from './cursor-recovery';
import {
  evaluateRunnerSourceAttestation,
  RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
  type RunnerSourceAttestationProbe,
} from './runner-source-attestation';
import type {
  SummerBottleneckRecord,
  SummerBottleneckStore,
} from './summer-bottleneck-loop';

export const GEM_DARK_RECOVERY_OUTBOX_PREFIX =
  'summer-bottleneck/cursor-recovery-outbox' as const;

export type GemDarkRecoveryDependencies = {
  readonly store: SummerBottleneckStore;
  readonly isGemDark: () => boolean | Promise<boolean>;
  readonly cursorApiKey?: string;
  readonly repository?: string;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
};

export type GemDarkRecoveryCycleResult =
  | {
      readonly status: 'skipped';
      readonly reason: 'gem-live';
    }
  | {
      readonly status: 'outbox-ready';
      readonly outbox: CursorRecoveryOutboxRecord;
      readonly outboxPath: string;
      readonly report: ReturnType<typeof buildGemDarkExerciseReport>;
      readonly receipt?: CursorRecoveryReceipt;
    }
  | {
      readonly status: 'held' | 'denied';
      readonly report: ReturnType<typeof buildGemDarkExerciseReport>;
    };

function outboxPath(idempotencyKey: string): string {
  return `${GEM_DARK_RECOVERY_OUTBOX_PREFIX}/${idempotencyKey}.json`;
}

export function gemDarkAdmissionContext(
  overrides: Partial<RecoveryAdmissionContext> = {}
): RecoveryAdmissionContext {
  return {
    gemDark: true,
    preauthorizedRecovery: false,
    liveOwnershipResolved: false,
    requestsLiveMutationOrTakeover: false,
    ...overrides,
  };
}

/**
 * Persist a governor-routed Cursor recovery outbox record.
 * Idempotent on pathname; conflicting payloads fail closed.
 */
export async function persistCursorRecoveryOutbox(
  store: SummerBottleneckStore,
  outbox: CursorRecoveryOutboxRecord
): Promise<{ readonly path: string; readonly created: boolean }> {
  if (outbox.destination !== 'cursor-cloud') {
    throw new Error('cursor recovery outbox destination must be cursor-cloud');
  }
  const selectedProvider = outbox.route.selectedRoute.tuple.provider;
  if (selectedProvider === 'gem' || selectedProvider === 'symphony') {
    throw new Error('cursor recovery outbox must not select gem/symphony');
  }

  const path = outboxPath(outbox.idempotencyKey);
  const result = await store.create(
    path,
    outbox as unknown as SummerBottleneckRecord
  );
  if (result === 'exists') {
    const existing = await store.read(path);
    if (!existing) {
      throw new Error('cursor recovery outbox exists but is unreadable');
    }
    if (JSON.stringify(existing) !== JSON.stringify(outbox)) {
      throw new Error('cursor recovery outbox conflict');
    }
    return { path, created: false };
  }
  if (result !== 'created') {
    throw new Error(
      `unexpected cursor recovery outbox create result: ${String(result)}`
    );
  }
  return { path, created: true };
}

/**
 * Gem-dark recovery cycle for Summer heartbeat / commissioning.
 *
 * - Gem live → skip (normal symphony path remains authoritative)
 * - Gem dark + isolated recovery → durable cursor-cloud outbox (+ optional launch)
 * - Self-expansion / live takeover / gem-dependent mutation → deny or hold with named gap
 */
export async function runGemDarkRecoveryCycle(
  dependencies: GemDarkRecoveryDependencies,
  input: {
    readonly objective: string;
    readonly evidenceRefs: readonly string[];
    readonly idempotencyKey: string;
    readonly admission?: Partial<RecoveryAdmissionContext>;
    readonly launch?: boolean;
    readonly timeoutMs?: number;
  }
): Promise<GemDarkRecoveryCycleResult> {
  const gemDark = await dependencies.isGemDark();
  if (!gemDark) {
    return { status: 'skipped', reason: 'gem-live' };
  }

  const context = gemDarkAdmissionContext({
    gemDark: true,
    ...input.admission,
  });
  const disposition = disposeGemDarkRecovery(context);
  if (disposition.status !== 'admit') {
    return {
      status: disposition.status === 'hold' ? 'held' : 'denied',
      report: buildGemDarkExerciseReport({ disposition }),
    };
  }

  const job = createIsolatedRecoveryJob({
    id: input.idempotencyKey,
    objective: input.objective,
    evidenceRefs: input.evidenceRefs,
  });
  const outbox = buildCursorRecoveryOutbox({
    job,
    context,
    idempotencyKey: input.idempotencyKey,
  });
  const persisted = await persistCursorRecoveryOutbox(
    dependencies.store,
    outbox
  );

  if (!input.launch || !dependencies.cursorApiKey || !dependencies.repository) {
    return {
      status: 'outbox-ready',
      outbox,
      outboxPath: persisted.path,
      report: buildGemDarkExerciseReport({ disposition }),
    };
  }

  const launched = await requestCursorIsolatedRecovery({
    job,
    context,
    cursorApiKey: dependencies.cursorApiKey,
    repository: dependencies.repository,
    timeoutMs: input.timeoutMs ?? 60_000,
    fetchImpl: dependencies.fetchImpl,
    sleep: dependencies.sleep,
  });

  return {
    status: 'outbox-ready',
    outbox,
    outboxPath: persisted.path,
    report: buildGemDarkExerciseReport({
      disposition,
      recoveryReceipt: launched.receipt,
    }),
    receipt: launched.receipt,
  };
}




export {
  evaluateRunnerSourceAttestation,
  RUNNER_SOURCE_ATTESTATION_MAX_AGE_MS,
  type RunnerSourceAttestationProbe,
};

export type GemDarkTriggerDecision =
  | {
      readonly dark: true;
      readonly reason: 'explicit-env' | 'runner-source-attestation-unavailable';
      readonly attestation?: RunnerSourceAttestationProbe;
    }
  | {
      readonly dark: false;
      readonly reason:
        | 'explicit-env-live'
        | 'attestation-fresh'
        | 'unknown-fail-closed';
      readonly attestation?: RunnerSourceAttestationProbe;
    };

/**
 * Resolve whether Summer should enter the Gem-independent Cursor recovery lane.
 *
 * Priority:
 * 1. SUMMER_GEM_DARK explicit override
 * 2. Configured runner-source attestation receipt (path/env JSON) — unavailable/stale → dark
 * 3. Otherwise fail closed toward "not dark" (no accidental Cursor spend)
 */
export function resolveGemDarkTrigger(input: {
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly attestationReceipt?: unknown;
  readonly nowMs?: number;
}): GemDarkTriggerDecision {
  const environment = input.environment ?? process.env;
  const explicit = environment.SUMMER_GEM_DARK?.trim().toLowerCase();
  if (explicit === '1' || explicit === 'true' || explicit === 'dark') {
    return { dark: true, reason: 'explicit-env' };
  }
  if (explicit === '0' || explicit === 'false' || explicit === 'live') {
    return { dark: false, reason: 'explicit-env-live' };
  }

  // PATH alone is not a sync signal — callers must load via
  // loadRunnerSourceAttestationFromEnvironment and pass attestationReceipt.
  const hasAttestationInput =
    input.attestationReceipt !== undefined ||
    Boolean(environment.SUMMER_RUNNER_SOURCE_ATTESTATION_JSON?.trim());

  if (!hasAttestationInput) {
    // No probe configured and no explicit dark flag.
    return { dark: false, reason: 'unknown-fail-closed' };
  }

  let receipt = input.attestationReceipt;
  if (receipt === undefined) {
    const inline = environment.SUMMER_RUNNER_SOURCE_ATTESTATION_JSON?.trim();
    if (inline) {
      try {
        receipt = JSON.parse(inline) as unknown;
      } catch {
        receipt = null;
      }
    }
  }

  const attestation = evaluateRunnerSourceAttestation(
    receipt ?? null,
    input.nowMs ?? Date.now()
  );
  if (attestation.status === 'fresh') {
    return { dark: false, reason: 'attestation-fresh', attestation };
  }
  return {
    dark: true,
    reason: 'runner-source-attestation-unavailable',
    attestation,
  };
}

/** Environment-backed Gem liveness probe used by the heartbeat. */
export function isGemDarkFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: {
    readonly attestationReceipt?: unknown;
    readonly nowMs?: number;
  } = {}
): boolean {
  return resolveGemDarkTrigger({
    environment,
    attestationReceipt: options.attestationReceipt,
    nowMs: options.nowMs,
  }).dark;
}

/**
 * Load attestation JSON from SUMMER_RUNNER_SOURCE_ATTESTATION_PATH when set.
 * Missing/unreadable files count as unavailable (caller decides dark policy).
 */
export async function loadRunnerSourceAttestationFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  readFile: (path: string) => Promise<string> = async path => {
    const { readFile: fsRead } = await import('node:fs/promises');
    return fsRead(path, 'utf8');
  }
): Promise<unknown> {
  const inline = environment.SUMMER_RUNNER_SOURCE_ATTESTATION_JSON?.trim();
  if (inline) {
    try {
      return JSON.parse(inline) as unknown;
    } catch {
      return null;
    }
  }
  const path = environment.SUMMER_RUNNER_SOURCE_ATTESTATION_PATH?.trim();
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(path)) as unknown;
  } catch {
    return null;
  }
}
