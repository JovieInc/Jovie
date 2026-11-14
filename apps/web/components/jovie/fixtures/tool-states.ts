import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { hydratePersistedMessageParts } from '../message-parts';
import type { MessagePart } from '../types';
import { TOOL_STATUS_EVENT, TOOL_STATUS_PARTS } from './tool-status';

/** State fixtures for ToolPartsRenderer stories and certificate tests. */
function statusEvent(
  toolCallId: string,
  overrides: Partial<PersistedToolEvent> = {}
): PersistedToolEvent {
  return { ...TOOL_STATUS_EVENT, toolCallId, ...overrides };
}

export const TOOL_STATE_PARTS = {
  loading: TOOL_STATUS_PARTS.working,
  empty: [
    { type: 'text', text: 'No tools ran for this reply.' },
  ] satisfies readonly MessagePart[],
  error: TOOL_STATUS_PARTS.failed,
  partial: hydratePersistedMessageParts('', [
    statusEvent('press-source:saved', {
      output: { success: true, summary: 'Press source saved.' },
      summary: 'Press source saved.',
    }),
    statusEvent('press-source:failed', {
      state: 'failed',
      output: undefined,
      errorMessage: 'Second press source could not be loaded.',
      retryable: true,
    }),
  ]),
  longContent: hydratePersistedMessageParts(
    '',
    [1, 2, 3, 4].map(index =>
      statusEvent(`press-source:long-${index}`, {
        input: {
          url: `https://press.example/artist/features/a-very-long-feature-slug-${index}`,
        },
        output: {
          success: true,
          summary: `Saved press feature ${index}: The Midnight Collective on the making of Midnight Drive (Deluxe Anniversary Edition), the Texas tour and the remix single that follows it.`,
        },
        summary: `Saved press feature ${index}: The Midnight Collective on the making of Midnight Drive (Deluxe Anniversary Edition), the Texas tour and the remix single that follows it.`,
      })
    )
  ),
  offline: [
    {
      type: 'dynamic-tool',
      toolName: TOOL_STATUS_EVENT.toolName,
      toolCallId: 'press-source:offline',
      state: 'output-available',
      input: TOOL_STATUS_EVENT.input,
      output: {
        success: false,
        error: 'The press source could not be reached.',
        errorCode: 'PROVIDER_UNAVAILABLE',
        retryable: true,
      },
    },
  ] satisfies readonly MessagePart[],
  permissionDenied: [
    {
      type: 'dynamic-tool',
      toolName: 'generateAlbumArt',
      toolCallId: 'album-art:locked',
      state: 'output-available',
      input: {},
      output: {
        success: true,
        locked: true,
        reason: 'Album art requires the Max plan.',
        plan_required: 'Max',
      },
    },
  ] satisfies readonly MessagePart[],
  rtl: hydratePersistedMessageParts('', [
    statusEvent('press-source:rtl', {
      output: { success: true, summary: 'تم حفظ مصدر الصحافة.' },
      summary: 'تم حفظ مصدر الصحافة.',
    }),
  ]),
} as const;
