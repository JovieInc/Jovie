import {
  type DynamicToolUIPart,
  getToolName,
  isToolUIPart,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { getToolUiConfig } from './tool-ui-registry';

export type PersistedToolState =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'denied'
  | 'needs-approval';

export type PersistedToolUiHint = 'artifact' | 'status';

export interface PersistedToolEvent {
  readonly schemaVersion: 2;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly state: PersistedToolState;
  readonly input?: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly errorMessage?: string;
  readonly summary?: string;
  readonly uiHint: PersistedToolUiHint;
}

export interface PendingToolPersistenceEnvelope {
  readonly userMessage: string;
}

const recordSchema = z.record(z.string(), z.unknown());

export const persistedToolEventSchema = z.object({
  schemaVersion: z.literal(2),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  state: z.enum(['running', 'succeeded', 'failed', 'denied', 'needs-approval']),
  input: recordSchema.optional(),
  output: recordSchema.optional(),
  errorMessage: z.string().optional(),
  summary: z.string().optional(),
  uiHint: z.enum(['artifact', 'status']),
});

export const persistedToolEventsSchema = z.array(persistedToolEventSchema);

export const chatPersistenceMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(50_000),
    toolCalls: persistedToolEventsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === 'user' && value.content.length < 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'User messages must include content.',
        path: ['content'],
      });
    }

    if (
      value.role === 'assistant' &&
      value.content.length < 1 &&
      (!value.toolCalls || value.toolCalls.length === 0)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Assistant messages require content unless they include tool calls.',
        path: ['content'],
      });
    }
  });

export const chatPersistenceBatchSchema = z.object({
  messages: z.array(chatPersistenceMessageSchema).min(1).max(100),
});

export type ChatPersistenceMessage = z.infer<
  typeof chatPersistenceMessageSchema
>;
export type ChatPersistenceBatch = z.infer<typeof chatPersistenceBatchSchema>;

type ToolPart = UIMessage['parts'][number] & {
  readonly toolCallId?: string;
  readonly input?: unknown;
  readonly output?: unknown;
  readonly errorText?: string;
  readonly state?: string;
  readonly approval?: {
    readonly id: string;
    readonly approved?: boolean;
    readonly reason?: string;
  };
};

export interface DecodedToolEvents {
  readonly events: PersistedToolEvent[];
  readonly source: 'empty' | 'v2' | 'legacy' | 'invalid';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function extractSummary(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ['summary', 'title', 'message', 'error']) {
    if (typeof value[key] === 'string' && value[key].trim().length > 0) {
      return value[key].trim();
    }
  }

  return undefined;
}

function mapUiStateToPersistedState(
  state: string
): PersistedToolState | undefined {
  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return 'running';
    case 'approval-requested':
    case 'approval-responded':
      return 'needs-approval';
    case 'output-available':
      return 'succeeded';
    case 'output-error':
      return 'failed';
    case 'output-denied':
      return 'denied';
    default:
      return undefined;
  }
}

function mapPersistedStateToUiState(
  state: PersistedToolState
):
  | 'input-available'
  | 'output-available'
  | 'output-error'
  | 'output-denied'
  | 'approval-requested' {
  switch (state) {
    case 'running':
      return 'input-available';
    case 'succeeded':
      return 'output-available';
    case 'failed':
      return 'output-error';
    case 'denied':
      return 'output-denied';
    case 'needs-approval':
      return 'approval-requested';
  }
}

function normalizeToolPart(part: ToolPart): PersistedToolEvent | null {
  if (!isToolUIPart(part)) {
    return null;
  }

  const toolName = getToolName(part);
  const mappedState = mapUiStateToPersistedState(part.state);

  if (
    !mappedState ||
    typeof part.toolCallId !== 'string' ||
    part.toolCallId.length < 1
  ) {
    return null;
  }

  const config = getToolUiConfig(toolName);
  const input = asRecord(part.input);
  const output = asRecord(part.output);
  const state =
    mappedState === 'succeeded' && output?.success === false
      ? 'failed'
      : mappedState;
  const approvalReason =
    part.approval && typeof part.approval.reason === 'string'
      ? part.approval.reason
      : undefined;

  return {
    schemaVersion: 2,
    toolCallId: part.toolCallId,
    toolName,
    state,
    input,
    output,
    errorMessage:
      typeof part.errorText === 'string'
        ? part.errorText
        : state === 'denied'
          ? approvalReason
          : undefined,
    summary:
      state === 'succeeded'
        ? extractSummary(output)
        : state === 'failed' || state === 'denied'
          ? (extractSummary(output) ?? approvalReason)
          : undefined,
    uiHint: config.uiHint,
  };
}

function normalizeLegacyState(
  value: unknown,
  result: Record<string, unknown> | undefined
): PersistedToolState {
  if (value === 'partial-call' || value === 'call') {
    return 'running';
  }

  if (result?.success === false) {
    return 'failed';
  }

  return 'succeeded';
}

function decodeLegacyToolEvent(
  value: unknown,
  index: number
): PersistedToolEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = isRecord(value.toolInvocation)
    ? value.toolInvocation
    : undefined;
  const toolNameCandidate = value.toolName ?? nested?.toolName;
  const toolName =
    typeof toolNameCandidate === 'string' && toolNameCandidate.length > 0
      ? toolNameCandidate
      : null;

  if (!toolName) {
    return null;
  }

  const toolCallIdCandidate =
    value.toolCallId ??
    value.toolInvocationId ??
    nested?.toolCallId ??
    nested?.toolInvocationId;
  const toolCallId =
    typeof toolCallIdCandidate === 'string' && toolCallIdCandidate.length > 0
      ? toolCallIdCandidate
      : `legacy-tool-${index}`;

  const input = asRecord(value.args ?? nested?.args);
  const output = asRecord(value.result ?? nested?.result);
  const state = normalizeLegacyState(value.state ?? nested?.state, output);
  const config = getToolUiConfig(toolName);

  return {
    schemaVersion: 2,
    toolCallId,
    toolName,
    state,
    input,
    output,
    errorMessage:
      state === 'failed'
        ? (extractSummary(output) ?? 'Tool execution failed.')
        : undefined,
    summary: state === 'succeeded' ? extractSummary(output) : undefined,
    uiHint: config.uiHint,
  };
}

function dedupeEvents(events: PersistedToolEvent[]): PersistedToolEvent[] {
  const byId = new Map<string, PersistedToolEvent>();

  for (const event of events) {
    byId.set(event.toolCallId, event);
  }

  return Array.from(byId.values());
}

export function encodeToolEvents(
  parts: ReadonlyArray<UIMessage['parts'][number]>
): PersistedToolEvent[] | undefined {
  const events = dedupeEvents(
    parts
      .map(part => normalizeToolPart(part as ToolPart))
      .filter((event): event is PersistedToolEvent => event !== null)
  );

  return events.length > 0 ? events : undefined;
}

export function decodeToolEvents(toolCalls: unknown): DecodedToolEvents {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return { events: [], source: 'empty' };
  }

  const v2 = persistedToolEventsSchema.safeParse(toolCalls);
  if (v2.success) {
    return { events: dedupeEvents(v2.data), source: 'v2' };
  }

  const legacyEvents = dedupeEvents(
    toolCalls
      .map((toolCall, index) => decodeLegacyToolEvent(toolCall, index))
      .filter((event): event is PersistedToolEvent => event !== null)
  );

  if (legacyEvents.length > 0) {
    return { events: legacyEvents, source: 'legacy' };
  }

  return { events: [], source: 'invalid' };
}

export function toolEventToMessagePart(
  event: PersistedToolEvent
): DynamicToolUIPart {
  const uiState = mapPersistedStateToUiState(event.state);

  if (uiState === 'input-available') {
    return {
      type: 'dynamic-tool',
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      state: uiState,
      input: event.input ?? {},
    };
  }

  if (uiState === 'output-available') {
    return {
      type: 'dynamic-tool',
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      state: uiState,
      input: event.input ?? {},
      output: event.output ?? {},
    };
  }

  if (uiState === 'output-error') {
    return {
      type: 'dynamic-tool',
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      state: uiState,
      input: event.input,
      errorText: event.errorMessage ?? 'Tool execution failed.',
    };
  }

  if (uiState === 'output-denied') {
    return {
      type: 'dynamic-tool',
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      state: uiState,
      input: event.input ?? {},
      approval: {
        id: `${event.toolCallId}-approval`,
        approved: false,
        ...(event.errorMessage ? { reason: event.errorMessage } : {}),
      },
    };
  }

  return {
    type: 'dynamic-tool',
    toolName: event.toolName,
    toolCallId: event.toolCallId,
    state: 'approval-requested',
    input: event.input ?? {},
    approval: {
      id: `${event.toolCallId}-approval`,
    },
  };
}
