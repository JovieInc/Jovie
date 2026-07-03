import 'server-only';

import { isChatMerchGenerationResult } from '@/components/jovie/components/ChatMerchCard';
import { isChatMerchDesignCarouselResult } from '@/components/jovie/components/ChatMerchDesignCarousel';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';

/** Tool names whose structured outputs iOS hydrates into native merch cards. */
export const MOBILE_MERCH_ARTIFACT_TOOL_NAMES = new Set([
  'createMerch',
  'previewMerchOptions',
]);

export function isMobileMerchArtifactOutput(
  output: unknown
): output is Record<string, unknown> {
  return (
    isChatMerchGenerationResult(output) ||
    isChatMerchDesignCarouselResult(output)
  );
}

/**
 * Embeds merch tool outputs into assistant `content` as `<tool_result>` blocks
 * the iOS `MobileChatContentParser` hydrates. Mobile chat streams text only;
 * without this, structured merch data in `toolCalls` never reaches the client.
 */
export function embedMobileMerchArtifactsInContent(
  content: string,
  toolEvents: readonly PersistedToolEvent[] | undefined
): string {
  if (!toolEvents?.length) {
    return content;
  }

  const blocks = toolEvents
    .filter(
      event =>
        MOBILE_MERCH_ARTIFACT_TOOL_NAMES.has(event.toolName) &&
        event.state === 'succeeded' &&
        isMobileMerchArtifactOutput(event.output)
    )
    .map(event => {
      const payload = JSON.stringify(event.output);
      return `<tool_result><name>${event.toolName}</name><state>success</state><json>${payload}</json></tool_result>`;
    });

  if (blocks.length === 0) {
    return content;
  }

  const trimmed = content.trimEnd();
  const prefix = trimmed.length > 0 ? `${trimmed}\n` : '';
  return `${prefix}${blocks.join('\n')}`;
}

/**
 * Builds persisted tool events from AI SDK tool results for mobile merch turns.
 */
export function mobileMerchToolEventsFromResults(
  toolResults: ReadonlyArray<{
    readonly toolName: string;
    readonly toolCallId: string;
    readonly output: unknown;
  }>
): PersistedToolEvent[] {
  return toolResults
    .filter(result => MOBILE_MERCH_ARTIFACT_TOOL_NAMES.has(result.toolName))
    .map(result => ({
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      state: 'succeeded' as const,
      output: result.output,
      summary: null,
      errorCode: null,
      errorMessage: null,
      retryable: false,
    }));
}
