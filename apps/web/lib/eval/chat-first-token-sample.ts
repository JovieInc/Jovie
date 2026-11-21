/** ASS-28 /app/chat TTFT sample helpers. */
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

const MODES = new Set(['live', 'relay', 'mocked', 'injected']);
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isMs = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function firstTokenP50Ms(samplesMs: readonly number[]): number | null {
  if (samplesMs.length === 0) return null;
  const s = [...samplesMs].toSorted((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * 0.5) - 1)] ?? null;
}

function base(
  status: ChatFirstTokenSampleStatus,
  mode: ChatFirstTokenSampleMode
) {
  return {
    schema: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA,
    schemaVersion: CHAT_FIRST_TOKEN_SAMPLE_SCHEMA_VERSION,
    metric: ASSISTANTS_FIRST_TOKEN_METRIC,
    status,
    surface: '/app/chat' as const,
    mode,
    account: 'test' as const,
    targetMs: ASSISTANTS_FIRST_TOKEN_TARGET_MS,
  };
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
  if (typeof value.mode !== 'string' || !MODES.has(value.mode)) {
    throw new Error('mode must be live|relay|mocked|injected');
  }
  if (!Array.isArray(value.samplesMs) || !value.samplesMs.every(isMs)) {
    throw new Error('samplesMs must be non-neg numbers');
  }
  const samplesMs = value.samplesMs.map(n => n);
  const p50 = firstTokenP50Ms(samplesMs);
  if (value.status === 'unrun') {
    if (samplesMs.length) throw new Error('unrun samplesMs must be empty');
    if (value.p50Ms !== null) throw new Error('unrun p50Ms must be null');
    if (value.recordedAt !== null)
      throw new Error('unrun recordedAt must be null');
  } else {
    if (!samplesMs.length) throw new Error('recorded needs samples');
    if (value.p50Ms !== p50) {
      throw new Error(`p50Ms ${String(value.p50Ms)} !== ${String(p50)}`);
    }
    if (typeof value.recordedAt !== 'string' || !value.recordedAt) {
      throw new Error('recordedAt must be non-empty ISO');
    }
  }
  let notes: string | undefined;
  if (value.notes !== undefined) {
    if (typeof value.notes !== 'string')
      throw new Error('notes must be a string');
    notes = value.notes;
  }
  return {
    ...base(value.status, value.mode as ChatFirstTokenSampleMode),
    recordedAt: value.recordedAt as string | null,
    samplesMs,
    p50Ms: value.status === 'recorded' ? p50 : null,
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
    ...base('unrun', 'relay'),
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
  if (!samplesMs.length || !samplesMs.every(isMs)) {
    throw new Error('need finite non-neg samplesMs');
  }
  const p50Ms = firstTokenP50Ms(samplesMs);
  if (p50Ms === null) throw new Error('p50Ms compute failed');
  return {
    ...base('recorded', input.mode ?? 'injected'),
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
