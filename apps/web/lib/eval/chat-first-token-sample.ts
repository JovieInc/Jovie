/** Assistants /app/chat TTFT sample helpers (ASS-28). CLI owns I/O. */
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
export const CHAT_FIRST_TOKEN_SAMPLE_UNRUN_RELATIVE =
  'lib/eval/fixtures/chat-first-token-sample.unrun.json' as const;

export type ChatFirstTokenSampleStatus = 'unrun' | 'recorded';
export type ChatFirstTokenSampleMode = 'live' | 'relay' | 'mocked' | 'injected';

export type ChatFirstTokenSample = {
  readonly schema: typeof CHAT_FIRST_TOKEN_SAMPLE_SCHEMA;
  readonly schemaVersion: typeof CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION;
  readonly metric: typeof ASSISTANTS_FIRST_TOKEN_METRIC;
  readonly status: ChatFirstTokenSampleStatus;
  readonly surface: '/app/chat';
  readonly mode: ChatFirstTokenSampleMode;
  readonly account: 'test';
  readonly targetMs: typeof ASSISTANTS_FIRST_TOKEN_TARGET_MS;
  readonly recordedAt: string | null;
  readonly samplesMs: readonly number[];
  readonly p50Ms: number | null;
  readonly notes?: string;
};

export function firstTokenP50Ms(samplesMs: readonly number[]): number | null {
  if (samplesMs.length === 0) return null;
  const sorted = [...samplesMs].toSorted((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.5) - 1);
  return sorted[index] ?? null;
}

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function parseChatFirstTokenSample(
  value: unknown
): ChatFirstTokenSample {
  if (!isObj(value)) throw new Error('sample must be object');
  if (value.schema !== CHAT_FIRST_TOKEN_SAMPLE_SCHEMA) {
    throw new Error(`schema must be ${CHAT_FIRST_TOKEN_SAMPLE_SCHEMA}`);
  }
  if (value.schemaVersion !== CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION) {
    throw new Error(
      `schemaVersion must be ${CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION}`
    );
  }
  if (value.metric !== ASSISTANTS_FIRST_TOKEN_METRIC) {
    throw new Error(`metric must be ${ASSISTANTS_FIRST_TOKEN_METRIC}`);
  }
  if (value.surface !== '/app/chat')
    throw new Error('surface must be /app/chat');
  if (value.account !== 'test') throw new Error('account must be "test"');
  if (value.targetMs !== ASSISTANTS_FIRST_TOKEN_TARGET_MS) {
    throw new Error(`targetMs must be ${ASSISTANTS_FIRST_TOKEN_TARGET_MS}`);
  }
  if (value.status !== 'unrun' && value.status !== 'recorded') {
    throw new Error('status must be unrun|recorded');
  }
  const modes = new Set(['live', 'relay', 'mocked', 'injected']);
  if (typeof value.mode !== 'string' || !modes.has(value.mode)) {
    throw new Error('mode must be live|relay|mocked|injected');
  }
  if (!Array.isArray(value.samplesMs) || !value.samplesMs.every(isMs)) {
    throw new Error('samplesMs must be non-neg numbers');
  }
  const samplesMs = value.samplesMs.map(n => n);
  const computedP50 = firstTokenP50Ms(samplesMs);

  if (value.status === 'unrun') {
    if (samplesMs.length !== 0)
      throw new Error('unrun samplesMs must be empty');
    if (value.p50Ms !== null) throw new Error('unrun p50Ms must be null');
    if (value.recordedAt !== null)
      throw new Error('unrun recordedAt must be null');
  } else {
    if (samplesMs.length === 0) throw new Error('recorded needs samples');
    if (value.p50Ms !== computedP50) {
      throw new Error(
        `p50Ms ${String(value.p50Ms)} !== ${String(computedP50)}`
      );
    }
    if (typeof value.recordedAt !== 'string' || value.recordedAt.length === 0) {
      throw new Error('recordedAt must be non-empty ISO');
    }
  }

  const notes =
    value.notes === undefined
      ? undefined
      : typeof value.notes === 'string'
        ? value.notes
        : (() => {
            throw new Error('notes must be a string');
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
  if (samplesMs.length === 0 || !samplesMs.every(isMs)) {
    throw new Error('need finite non-neg samplesMs');
  }
  const p50Ms = firstTokenP50Ms(samplesMs);
  if (p50Ms === null) throw new Error('p50Ms compute failed');
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

export function serializeChatFirstTokenSample(
  sample: ChatFirstTokenSample
): string {
  return `${JSON.stringify(parseChatFirstTokenSample(sample), null, 2)}\n`;
}
