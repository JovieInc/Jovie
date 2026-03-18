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

function hydrateToolInvocationPart(
  value: unknown,
  index: number
): ToolInvocationPart | null {
  if (!isRecord(value)) return null;

  if (isToolInvocationPart(value)) {
    return value;
  }

  const nested = isRecord(value.toolInvocation) ? value.toolInvocation : null;
  const toolName =
    typeof value.toolName === 'string'
      ? value.toolName
      : typeof nested?.toolName === 'string'
        ? nested.toolName
        : null;

  if (!toolName) {
    return null;
  }

  const state = normalizeToolInvocationState(value.state ?? nested?.state);
  const toolInvocationId =
    typeof value.toolInvocationId === 'string'
      ? value.toolInvocationId
      : typeof nested?.toolInvocationId === 'string'
        ? nested.toolInvocationId
        : typeof nested?.toolCallId === 'string'
          ? nested.toolCallId
          : `persisted-tool-${index}`;

  return {
    type: 'tool-invocation',
    toolInvocationId,
    toolName,
    state,
    args: isRecord(value.args)
      ? value.args
      : isRecord(nested?.args)
        ? nested.args
        : undefined,
    result: isRecord(value.result)
      ? value.result
      : isRecord(nested?.result)
        ? nested.result
        : undefined,
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
