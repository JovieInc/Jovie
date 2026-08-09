/**
 * The core-chat port of AgentHarness.
 *
 * Synchronous Jovie chat remains responsible for the user-facing AI SDK
 * stream. This port lets a durable agent observe a turn behind an explicit
 * feature gate without replacing Jovie's provider, tool, or leak-guard path.
 */

export type CoreChatHarnessStatus = 'disabled' | 'invoked' | 'fallback';

export type CoreChatHarnessReason =
  | 'feature_disabled'
  | 'prompt_disclosure_blocked'
  | 'missing_endpoint'
  | 'invalid_endpoint'
  | 'missing_auth'
  | 'aborted'
  | 'timeout'
  | 'http_error'
  | 'invalid_response'
  | 'agent_failed'
  | 'stream_error'
  | 'harness_error'
  | 'completed';

const CORE_CHAT_HARNESS_REASONS: readonly CoreChatHarnessReason[] = [
  'feature_disabled',
  'prompt_disclosure_blocked',
  'missing_endpoint',
  'invalid_endpoint',
  'missing_auth',
  'aborted',
  'timeout',
  'http_error',
  'invalid_response',
  'agent_failed',
  'stream_error',
  'harness_error',
  'completed',
];

const DISABLED_REASONS = new Set<
  Extract<
    CoreChatHarnessReason,
    'feature_disabled' | 'prompt_disclosure_blocked'
  >
>(['feature_disabled', 'prompt_disclosure_blocked']);

const FALLBACK_REASONS = new Set<
  Exclude<
    CoreChatHarnessReason,
    'feature_disabled' | 'prompt_disclosure_blocked' | 'completed'
  >
>([
  'missing_endpoint',
  'invalid_endpoint',
  'missing_auth',
  'aborted',
  'timeout',
  'http_error',
  'invalid_response',
  'agent_failed',
  'stream_error',
  'harness_error',
]);

export interface CoreChatHarnessInput {
  requestId: string;
  mode: 'app' | 'onboarding';
  selectedModel: string;
  toolNames: readonly string[];
  /** Most recent user text, bounded and never accompanied by the system prompt. */
  userMessage: string | null;
  signal: AbortSignal;
}

export interface CoreChatHarnessTrace {
  provider: 'eve';
  available: boolean;
  status: CoreChatHarnessStatus;
  reason: CoreChatHarnessReason;
  requestId: string;
  sessionId?: string;
  eventTypes: readonly string[];
  durationMs: number;
}

export interface CoreChatHarnessResult {
  trace: CoreChatHarnessTrace;
}

export interface CoreChatHarness {
  runCoreChatTurn(input: CoreChatHarnessInput): Promise<CoreChatHarnessResult>;
}

export function isCoreChatHarnessTrace(
  value: unknown
): value is CoreChatHarnessTrace {
  if (typeof value !== 'object' || value === null) return false;
  const trace = value as Record<string, unknown>;
  const status = trace.status;
  const available = trace.available;
  const eventTypes = trace.eventTypes;

  if (
    trace.provider !== 'eve' ||
    !['disabled', 'invoked', 'fallback'].includes(String(status)) ||
    typeof available !== 'boolean' ||
    !CORE_CHAT_HARNESS_REASONS.includes(
      trace.reason as CoreChatHarnessReason
    ) ||
    typeof trace.requestId !== 'string' ||
    !Array.isArray(eventTypes) ||
    !eventTypes.every(eventType => typeof eventType === 'string') ||
    typeof trace.durationMs !== 'number' ||
    !Number.isFinite(trace.durationMs) ||
    trace.durationMs < 0
  ) {
    return false;
  }

  if (status === 'invoked') {
    return (
      available === true &&
      trace.reason === 'completed' &&
      typeof trace.sessionId === 'string' &&
      trace.sessionId.trim().length > 0
    );
  }

  if (status === 'disabled') {
    return (
      available === false &&
      DISABLED_REASONS.has(
        trace.reason as Extract<
          CoreChatHarnessReason,
          'feature_disabled' | 'prompt_disclosure_blocked'
        >
      )
    );
  }

  return (
    available === false &&
    FALLBACK_REASONS.has(
      trace.reason as Exclude<
        CoreChatHarnessReason,
        'feature_disabled' | 'prompt_disclosure_blocked' | 'completed'
      >
    )
  );
}

export function makeCoreChatTrace(
  input: Pick<CoreChatHarnessInput, 'requestId'>,
  result: Pick<CoreChatHarnessTrace, 'status' | 'reason'> &
    Partial<
      Pick<CoreChatHarnessTrace, 'available' | 'sessionId' | 'eventTypes'>
    >,
  durationMs = 0
): CoreChatHarnessTrace {
  return {
    provider: 'eve',
    available: result.available ?? result.status === 'invoked',
    status: result.status,
    reason: result.reason,
    requestId: input.requestId,
    ...(result.sessionId ? { sessionId: result.sessionId } : {}),
    eventTypes: result.eventTypes ?? [],
    durationMs,
  };
}

export function makeCoreChatResult(
  input: Pick<CoreChatHarnessInput, 'requestId'>,
  result: Pick<CoreChatHarnessTrace, 'status' | 'reason'> &
    Partial<
      Pick<CoreChatHarnessTrace, 'available' | 'sessionId' | 'eventTypes'>
    >,
  durationMs = 0
): CoreChatHarnessResult {
  return { trace: makeCoreChatTrace(input, result, durationMs) };
}
