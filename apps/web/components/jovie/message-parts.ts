import {
  isToolInvocationPart,
  type MessagePart,
  type ToolInvocationPart,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeToolInvocationState(
  value: unknown
): ToolInvocationPart['state'] {
  return value === 'call' || value === 'partial-call' ? value : 'result';
}

function resolveStringField(
  primary: unknown,
  fallback: unknown
): string | null {
  if (typeof primary === 'string') return primary;
  if (typeof fallback === 'string') return fallback;
  return null;
}

function resolveRecordField(
  primary: unknown,
  fallback: unknown
): Record<string, unknown> | undefined {
  if (isRecord(primary)) return primary;
  if (isRecord(fallback)) return fallback;
  return undefined;
}

function resolveToolInvocationId(
  value: Record<string, unknown>,
  nested: Record<string, unknown> | null,
  index: number
): string {
  if (typeof value.toolInvocationId === 'string') return value.toolInvocationId;
  if (typeof nested?.toolInvocationId === 'string')
    return nested.toolInvocationId;
  if (typeof nested?.toolCallId === 'string') return nested.toolCallId;
  return `persisted-tool-${index}`;
}

function hydrateToolInvocationPart(
  value: unknown,
  index: number
): ToolInvocationPart | null {
  if (!isRecord(value)) return null;

  if (isToolInvocationPart(value)) {
    return value;
  }

  const nested = isRecord(value.toolInvocation) ? value.toolInvocation : null;
  const toolName = resolveStringField(value.toolName, nested?.toolName);

  if (!toolName) {
    return null;
  }

  const state = normalizeToolInvocationState(value.state ?? nested?.state);
  const toolInvocationId = resolveToolInvocationId(value, nested, index);

  return {
    type: 'tool-invocation',
    toolInvocationId,
    toolName,
    state,
    args: resolveRecordField(value.args, nested?.args),
    result: resolveRecordField(value.result, nested?.result),
    toolInvocation: {
      toolName,
      state,
    },
  };
}

export function extractPersistableToolCalls(
  parts: Array<{ type: string; [key: string]: unknown }>
) {
  const toolCalls = parts
    .filter(part => part.type === 'tool-invocation')
    .map(part => ({ ...part }));

  return toolCalls.length > 0 ? toolCalls : undefined;
}

export function hydratePersistedMessageParts(
  content: string,
  toolCalls: unknown
): MessagePart[] {
  const parts: MessagePart[] = [{ type: 'text', text: content }];

  if (!Array.isArray(toolCalls)) {
    return parts;
  }

  return parts.concat(
    toolCalls
      .map((toolCall, index) => hydrateToolInvocationPart(toolCall, index))
      .filter((toolCall): toolCall is ToolInvocationPart => toolCall !== null)
  );
}
