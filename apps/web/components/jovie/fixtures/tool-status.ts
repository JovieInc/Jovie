import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import { toolEventToMessagePart } from '@/lib/chat/tool-events';
import { hydratePersistedMessageParts } from '../message-parts';

/** Seeded v2 persistence records; stream parts intentionally carry no save receipt. */
export const TOOL_STATUS_EVENT = {
  schemaVersion: 2,
  toolCallId: 'press-source:attempt-1',
  toolName: 'inspectPressSource',
  state: 'succeeded',
  input: { url: 'https://press.example/artist' },
  output: { success: true, summary: 'Press source saved.' },
  uiHint: 'status',
} as const satisfies PersistedToolEvent;

export const TOOL_STATUS_PARTS = {
  working: [
    toolEventToMessagePart({
      ...TOOL_STATUS_EVENT,
      state: 'running',
      output: undefined,
    }),
  ],
  pending: [
    toolEventToMessagePart({
      ...TOOL_STATUS_EVENT,
      state: 'needs-approval',
      output: undefined,
    }),
  ],
  succeeded: hydratePersistedMessageParts('', [TOOL_STATUS_EVENT]),
  failed: [
    toolEventToMessagePart({
      ...TOOL_STATUS_EVENT,
      state: 'failed',
      output: undefined,
      errorMessage: 'Press source could not be loaded.',
    }),
  ],
  cancelled: [
    toolEventToMessagePart({
      ...TOOL_STATUS_EVENT,
      state: 'denied',
      output: undefined,
    }),
  ],
  unconfirmed: [toolEventToMessagePart(TOOL_STATUS_EVENT)],
} as const;
