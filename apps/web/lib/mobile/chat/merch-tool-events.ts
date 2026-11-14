import 'server-only';

import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { getToolUiConfig } from '@/lib/chat/tool-ui-registry';

/**
 * Mobile merch tool-event normalization (PR-5).
 *
 * Mobile merch chat must reflect the real tool output instead of marking
 * every retained create/preview result "succeeded": thrown generations and
 * zero-design results derive `failed` events with a user-facing message,
 * source-selection results stay `succeeded` artifacts, and nothing is
 * dropped. Identical on the initial turn and on replay.
 */

export const MOBILE_MERCH_EVENT_TOOL_NAMES = new Set([
  'createMerch',
  'previewMerchOptions',
  'findMerchSources',
]);

export const MERCH_ZERO_DESIGNS_FALLBACK_MESSAGE =
  'No merch designs came back. Add a confirmed catalog title or try a different phrase.';

export function isMerchSourceSelectionOutput(
  output: unknown
): output is Record<string, unknown> {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as { success?: unknown }).success === true &&
    (output as { state?: unknown }).state === 'source_selection_required'
  );
}

export function isZeroDesignMerchOutput(output: unknown): boolean {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as { success?: unknown }).success === true &&
    Array.isArray((output as { designs?: unknown }).designs) &&
    ((output as { designs?: readonly unknown[] }).designs?.length ?? 1) === 0
  );
}

function failedMerchEvent(
  result: {
    readonly toolName: string;
    readonly toolCallId: string;
  },
  output: Record<string, unknown>,
  errorMessage: string
): PersistedToolEvent {
  return {
    schemaVersion: 2,
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    state: 'failed',
    output,
    errorMessage,
    retryable: typeof output.retryable === 'boolean' ? output.retryable : false,
    uiHint: getToolUiConfig(result.toolName).uiHint,
  };
}

export function mobileMerchEventFromResult(result: {
  readonly toolName: string;
  readonly toolCallId: string;
  readonly output: unknown;
}): PersistedToolEvent | null {
  if (!MOBILE_MERCH_EVENT_TOOL_NAMES.has(result.toolName)) {
    return null;
  }
  const config = getToolUiConfig(result.toolName);
  const output =
    result.output &&
    typeof result.output === 'object' &&
    !Array.isArray(result.output)
      ? (result.output as Record<string, unknown>)
      : undefined;

  if (output && output.success === false) {
    const errorMessage =
      typeof output.error === 'string' && output.error.length > 0
        ? output.error
        : (config.errorTitle ?? `${config.label} Failed`);
    return failedMerchEvent(result, output, errorMessage);
  }

  if (output && isZeroDesignMerchOutput(output)) {
    const nextStep =
      typeof output.nextStep === 'string' && output.nextStep.length > 0
        ? output.nextStep
        : MERCH_ZERO_DESIGNS_FALLBACK_MESSAGE;
    return failedMerchEvent(result, output, nextStep);
  }

  const artifactShaped =
    output !== undefined &&
    (isMerchSourceSelectionOutput(output) ||
      Array.isArray(output['designs']) ||
      Array.isArray(output['options']));

  return {
    schemaVersion: 2,
    toolCallId: result.toolCallId,
    toolName: result.toolName,
    state: 'succeeded',
    output,
    retryable: false,
    uiHint: artifactShaped ? 'artifact' : config.uiHint,
  };
}

/**
 * Outcome-aware receipt inputs for a mobile merch turn: the turn only counts
 * as completed when the model produced text or at least one merch tool
 * actually succeeded; a thrown or zero-design generation yields its
 * user-facing failure message for the final assistant text.
 */
export function summarizeMobileMerchTurn(
  events: readonly PersistedToolEvent[],
  trimmedTextLength: number
): {
  readonly completed: boolean;
  readonly failureMessage: string | null;
} {
  const failure = events.find(event => event.state === 'failed');
  return {
    completed:
      trimmedTextLength > 0 ||
      events.some(event => event.state === 'succeeded'),
    failureMessage: failure?.errorMessage ?? null,
  };
}
