/**
 * Assistants `/app/chat` first-token (TTFT) sample harness (ASS-28).
 *
 * Pure parse/build/gate helpers for a JSON sample that `evaluateChatUxGate`
 * can consume. File I/O lives in `scripts/record-chat-first-token-sample.ts`
 * (CLI / workflow). Live / relay recording soft-skips without WORKERS_AI_TOKEN
 * (or an injected sample). Hermetic CI keeps status `unrun` until recorded.
 *
 * $0 Gateway by default — no prod writes, no feature flags.
 */

import {
  ASSISTANTS_FIRST_TOKEN_METRIC,
  ASSISTANTS_FIRST_TOKEN_TARGET_MS,
  type ChatUxGateResult,
  type ChatUxGateSample,
  evaluateChatUxGate,
} from './chat-ux-contract';

export const CHAT_FIRST_TOKEN_SAMPLE_SCHEMA =
  'jovie.assistants-chat-first-token/v1' as const;

export const CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION = 1 as const;

/** Default fixture kept in-repo as status=unrun (no live spend). */
export const CHAT_FIRST_TOKEN_SAMPLE_UNRUN_RELATIVE =
  'lib/eval/fixtures/chat-first-token-sample.unrun.json' as const;

export type ChatFirstTokenSampleStatus = 'unrun' | 'recorded';

export type ChatFirstTokenSampleMode = 'live' | 'relay' | 'mocked' | 'injected';

export type ChatFirstTokenSample = {
  readonly schema: typeof CHAT_FIRST_TOKEN_SAMPLE_SCHEMA;
  readonly schemaVersion: typeof CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION;
  readonly metric: typeof ASSISTANTS_FIRST_TOKEN_METRIC;
  readonly status: ChatFirstTokenSampleStatus;
  /** Product surface under test — Assistants target is `/app/chat`. */
  readonly surface: '/app/chat';
  readonly mode: ChatFirstTokenSampleMode;
  /** Must stay on the dedicated test account; never production creators. */
  readonly account: 'test';
  readonly targetMs: typeof ASSISTANTS_FIRST_TOKEN_TARGET_MS;
  /** ISO-8601 when status is recorded; null while unrun. */
  readonly recordedAt: string | null;
  /** Raw first-token durations in ms (empty while unrun). */
  readonly samplesMs: readonly number[];
  /** p50 of samplesMs when recorded; null while unrun. */
  readonly p50Ms: number | null;
  readonly notes?: string;
};

/**
 * Same nearest-rank p50 as `interaction-latency` UX summaries so CI receipts
 * and browser `chat_first_token` samples compare apples-to-apples.
 */
export function firstTokenP50Ms(samplesMs: readonly number[]): number | null {
  if (samplesMs.length === 0) return null;
  const sorted = [...samplesMs].toSorted((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.5) - 1);
  return sorted[index] ?? null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Parse + validate a TTFT sample JSON document. Throws on schema violations.
 */
export function parseChatFirstTokenSample(
  value: unknown
): ChatFirstTokenSample {
  if (!isPlainObject(value)) {
    throw new Error('chat-first-token sample must be a JSON object');
  }
  if (value.schema !== CHAT_FIRST_TOKEN_SAMPLE_SCHEMA) {
    throw new Error(
      `chat-first-token sample schema must be ${CHAT_FIRST_TOKEN_SAMPLE_SCHEMA}`
    );
  }
  if (value.schemaVersion !== CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION) {
    throw new Error(
      `chat-first-token sample schemaVersion must be ${CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION}`
    );
  }
  if (value.metric !== ASSISTANTS_FIRST_TOKEN_METRIC) {
    throw new Error(
      `chat-first-token sample metric must be ${ASSISTANTS_FIRST_TOKEN_METRIC}`
    );
  }
  if (value.surface !== '/app/chat') {
    throw new Error('chat-first-token sample surface must be /app/chat');
  }
  if (value.account !== 'test') {
    throw new Error('chat-first-token sample account must be "test"');
  }
  if (value.targetMs !== ASSISTANTS_FIRST_TOKEN_TARGET_MS) {
    throw new Error(
      `chat-first-token sample targetMs must be ${ASSISTANTS_FIRST_TOKEN_TARGET_MS}`
    );
  }
  if (value.status !== 'unrun' && value.status !== 'recorded') {
    throw new Error('chat-first-token sample status must be unrun|recorded');
  }
  const modes = new Set(['live', 'relay', 'mocked', 'injected']);
  if (typeof value.mode !== 'string' || !modes.has(value.mode)) {
    throw new Error(
      'chat-first-token sample mode must be live|relay|mocked|injected'
    );
  }
  if (
    !Array.isArray(value.samplesMs) ||
    !value.samplesMs.every(isFiniteNonNegMs)
  ) {
    throw new Error(
      'chat-first-token sample samplesMs must be an array of finite non-negative numbers'
    );
  }
  const samplesMs = value.samplesMs.map(n => n);
  const computedP50 = firstTokenP50Ms(samplesMs);

  if (value.status === 'unrun') {
    if (samplesMs.length !== 0) {
      throw new Error(
        'unrun chat-first-token sample must have empty samplesMs'
      );
    }
    if (value.p50Ms !== null) {
      throw new Error('unrun chat-first-token sample must have p50Ms null');
    }
    if (value.recordedAt !== null) {
      throw new Error(
        'unrun chat-first-token sample must have recordedAt null'
      );
    }
  } else {
    if (samplesMs.length === 0) {
      throw new Error(
        'recorded chat-first-token sample needs at least one sample'
      );
    }
    if (value.p50Ms !== computedP50) {
      throw new Error(
        `recorded chat-first-token sample p50Ms ${String(value.p50Ms)} !== computed ${String(computedP50)}`
      );
    }
    if (typeof value.recordedAt !== 'string' || value.recordedAt.length === 0) {
      throw new Error(
        'recorded chat-first-token sample recordedAt must be a non-empty ISO string'
      );
    }
  }

  const notes =
    value.notes === undefined
      ? undefined
      : typeof value.notes === 'string'
        ? value.notes
        : (() => {
            throw new Error('chat-first-token sample notes must be a string');
          })();

  return {
    schema: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA,
    schemaVersion: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION,
    metric: ASSISTANTS_FIRST_TOKEN_METRIC,
    status: value.status,
    surface: '/app/chat',
    mode: value.mode as ChatFirstTokenSampleMode,
    account: 'test',
    targetMs: ASSISTANTS_FIRST_TOKEN_TARGET_MS,
    recordedAt: value.recordedAt as string | null,
    samplesMs,
    p50Ms: value.status === 'recorded' ? computedP50 : null,
    ...(notes === undefined ? {} : { notes }),
  };
}

/** Map a TTFT sample into the Assistants UX gate input shape. */
export function chatFirstTokenSampleToGateInput(
  sample: ChatFirstTokenSample,
  jankPassed: boolean
): ChatUxGateSample {
  return {
    jankPassed,
    firstTokenP50Ms: sample.p50Ms,
    firstTokenStatus: sample.status,
  };
}

/**
 * Fail-closed when a recorded sample's p50 ≥ 1000ms. Unrun samples skip the
 * latency compare (jank still fail-closes via `jankPassed`).
 */
export function evaluateChatFirstTokenSample(
  sample: ChatFirstTokenSample,
  jankPassed = true
): ChatUxGateResult {
  return evaluateChatUxGate(
    chatFirstTokenSampleToGateInput(sample, jankPassed)
  );
}

export function buildUnrunChatFirstTokenSample(
  notes?: string
): ChatFirstTokenSample {
  return {
    schema: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA,
    schemaVersion: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION,
    metric: ASSISTANTS_FIRST_TOKEN_METRIC,
    status: 'unrun',
    surface: '/app/chat',
    mode: 'relay',
    account: 'test',
    targetMs: ASSISTANTS_FIRST_TOKEN_TARGET_MS,
    recordedAt: null,
    samplesMs: [],
    p50Ms: null,
    ...(notes === undefined ? {} : { notes }),
  };
}

export function buildRecordedChatFirstTokenSample(input: {
  readonly samplesMs: readonly number[];
  readonly mode?: ChatFirstTokenSampleMode;
  readonly recordedAt?: string;
  readonly notes?: string;
}): ChatFirstTokenSample {
  const samplesMs = [...input.samplesMs];
  if (samplesMs.length === 0 || !samplesMs.every(isFiniteNonNegMs)) {
    throw new Error('recorded sample requires finite non-negative samplesMs');
  }
  const p50Ms = firstTokenP50Ms(samplesMs);
  if (p50Ms === null) {
    throw new Error('recorded sample p50Ms could not be computed');
  }
  return {
    schema: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA,
    schemaVersion: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION,
    metric: ASSISTANTS_FIRST_TOKEN_METRIC,
    status: 'recorded',
    surface: '/app/chat',
    mode: input.mode ?? 'injected',
    account: 'test',
    targetMs: ASSISTANTS_FIRST_TOKEN_TARGET_MS,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    samplesMs,
    p50Ms,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}

/** Serialize a validated sample for CLI / workflow writers (I/O stays outside lib/). */
export function serializeChatFirstTokenSample(
  sample: ChatFirstTokenSample
): string {
  const validated = parseChatFirstTokenSample(sample);
  return `${JSON.stringify(validated, null, 2)}\n`;
}
