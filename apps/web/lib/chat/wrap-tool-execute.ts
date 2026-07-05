import 'server-only';

import type { Tool, ToolSet } from 'ai';
import { captureError } from '@/lib/error-tracking';
import {
  classifyThrownToolError,
  normalizeToolFailureOutput,
} from './tool-errors';

type ToolExecute = Tool['execute'];

/**
 * Mirrors the track-route audience upsert fail-soft pattern: tool failures must
 * never take down the chat stream. Throws are captured, logged, and returned as
 * structured `{ success: false, errorCode, ... }` payloads.
 */
export function withFailSoftToolExecute(
  toolName: string,
  execute: ToolExecute | undefined
): ToolExecute | undefined {
  if (!execute) {
    return execute;
  }

  return async (input, options) => {
    try {
      const result = await execute(input, options);
      const normalizedFailure = normalizeToolFailureOutput(toolName, result);
      return normalizedFailure ?? result;
    } catch (error) {
      const failure = classifyThrownToolError(toolName, error);
      await captureError('Chat tool execute failed', error, {
        feature: 'ai-chat',
        source: 'chat-tool-execute',
        toolName,
        errorCode: failure.errorCode,
        retryable: failure.retryable,
      });
      return failure;
    }
  };
}

export function wrapToolSetFailSoft(tools: ToolSet): ToolSet {
  const wrappedEntries = Object.entries(tools).map(([toolName, toolConfig]) => {
    if (!toolConfig || typeof toolConfig !== 'object') {
      return [toolName, toolConfig] as const;
    }

    const execute = 'execute' in toolConfig ? toolConfig.execute : undefined;
    if (typeof execute !== 'function') {
      return [toolName, toolConfig] as const;
    }

    return [
      toolName,
      {
        ...toolConfig,
        execute: withFailSoftToolExecute(toolName, execute),
      },
    ] as const;
  });

  return Object.fromEntries(wrappedEntries);
}
