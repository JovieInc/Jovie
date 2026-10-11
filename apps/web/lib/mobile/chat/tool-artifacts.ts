import 'server-only';

import { isDeepStrictEqual } from 'node:util';

import { isChatMerchGenerationResult } from '@/components/jovie/components/ChatMerchCard';
import { isChatMerchDesignCarouselResult } from '@/components/jovie/components/ChatMerchDesignCarousel';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { getToolUiConfig } from '@/lib/chat/tool-ui-registry';

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

export function isMobileMerchArtifactEvent(
  event: PersistedToolEvent
): event is PersistedToolEvent & { output: Record<string, unknown> } {
  return (
    MOBILE_MERCH_ARTIFACT_TOOL_NAMES.has(event.toolName) &&
    event.state === 'succeeded' &&
    isMobileMerchArtifactOutput(event.output)
  );
}

export function embedMobileMerchArtifactsInContent(
  content: string,
  toolEvents: readonly PersistedToolEvent[] | undefined
): string {
  if (!toolEvents?.length) {
    return content;
  }

  const existing = Array.from(
    content.matchAll(
      /<tool_result><name>([^<]+)<\/name><state>success<\/state><json>([\s\S]*?)<\/json><\/tool_result>/g
    )
  ).flatMap(([, toolName, json]) => {
    if (!toolName || !json) return [];
    try {
      const output: unknown = JSON.parse(json);
      if (
        MOBILE_MERCH_ARTIFACT_TOOL_NAMES.has(toolName) &&
        isMobileMerchArtifactOutput(output)
      ) {
        return [{ toolName, output }];
      }
    } catch {
      // Malformed lookalikes do not suppress a valid artifact.
    }
    return [];
  });
  const blocks = toolEvents
    .filter(isMobileMerchArtifactEvent)
    .flatMap(event => {
      const payload = JSON.stringify(event.output);
      const normalized: unknown = JSON.parse(payload);
      const index = existing.findIndex(
        block =>
          block.toolName === event.toolName &&
          isDeepStrictEqual(block.output, normalized)
      );
      if (index >= 0) {
        // Consume one occurrence so distinct same-output calls retain multiplicity.
        existing.splice(index, 1);
        return [];
      }
      return [
        `<tool_result><name>${event.toolName}</name><state>success</state><json>${payload}</json></tool_result>`,
      ];
    });

  if (blocks.length === 0) {
    return content;
  }

  const trimmed = content.trimEnd();
  const prefix = trimmed.length > 0 ? `${trimmed}\n` : '';
  return `${prefix}${blocks.join('\n')}`;
}

export function mobileMerchToolEventsFromResults(
  toolResults: ReadonlyArray<{
    readonly toolName: string;
    readonly toolCallId: string;
    readonly output: unknown;
  }>
): PersistedToolEvent[] {
  return toolResults
    .filter(result => MOBILE_MERCH_ARTIFACT_TOOL_NAMES.has(result.toolName))
    .map(result => {
      const config = getToolUiConfig(result.toolName);
      const output =
        result.output &&
        typeof result.output === 'object' &&
        !Array.isArray(result.output)
          ? (result.output as Record<string, unknown>)
          : undefined;

      return {
        schemaVersion: 2 as const,
        toolCallId: result.toolCallId,
        toolName: result.toolName,
        state: 'succeeded' as const,
        output,
        retryable: false,
        uiHint: config.uiHint,
      };
    });
}
