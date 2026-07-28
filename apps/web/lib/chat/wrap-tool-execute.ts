import 'server-only';

import type { Tool, ToolSet } from 'ai';
import { logEntitlementDenial } from '@/lib/entitlements/demand-signal';
import { captureError } from '@/lib/error-tracking';
import {
  buildLockedToolResultForTool,
  isLockableChatToolName,
  LOCKABLE_CHAT_TOOL_GATES,
} from './locked-tools';
import {
  classifyThrownToolError,
  isEntitlementDenialError,
  normalizeToolFailureOutput,
  TOOL_ERROR_CODES,
} from './tool-errors';

type ToolExecute = Tool['execute'];

/**
 * Mirrors the track-route audience upsert fail-soft pattern: tool failures must
 * never take down the chat stream. Throws are captured, logged, and returned as
 * structured `{ success: false, errorCode, ... }` payloads.
 *
 * Expected entitlement denials (TasksUpgradeRequiredError / PLAN_UNAVAILABLE)
 * are NOT Sentry errors (JOV-3861): they return a success-shaped locked payload
 * so the chat UI renders an upgrade CTA, log demand signal only, and set
 * retryable=false so the model does not auto-retry the paywall.
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

      if (normalizedFailure?.errorCode === TOOL_ERROR_CODES.PLAN_UNAVAILABLE) {
        return toLockedUpgradeResult(toolName, normalizedFailure.error, {
          source: 'chat-tool-throw',
        });
      }

      return normalizedFailure ?? result;
    } catch (error) {
      if (isEntitlementDenialError(error)) {
        const message =
          error instanceof Error ? error.message : 'Requires a Pro plan.';
        return toLockedUpgradeResult(toolName, message, {
          source: 'chat-tool-throw',
          code:
            error instanceof Error
              ? String((error as { code?: unknown }).code ?? '')
              : undefined,
        });
      }

      const failure = classifyThrownToolError(toolName, error);

      if (failure.errorCode === TOOL_ERROR_CODES.PLAN_UNAVAILABLE) {
        return toLockedUpgradeResult(toolName, failure.error, {
          source: 'chat-tool-throw',
        });
      }

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

function toLockedUpgradeResult(
  toolName: string,
  message: string,
  meta: {
    readonly source: 'chat-tool-throw';
    readonly code?: string;
  }
) {
  const gate = isLockableChatToolName(toolName)
    ? LOCKABLE_CHAT_TOOL_GATES[toolName]
    : 'canAccessTasksWorkspace';

  const locked = buildLockedToolResultForTool(toolName, {
    gate,
    message,
  });

  logEntitlementDenial({
    gate: locked.gate,
    source: meta.source,
    toolName,
    code: meta.code || undefined,
    planRequired: locked.plan_required,
    message: locked.summary,
  });

  return locked;
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
