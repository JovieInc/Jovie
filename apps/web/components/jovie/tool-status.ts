import {
  type OperationStatus,
  resolveOperationStatus,
} from '@jovie/ui/lib/utils';
import type { PersistedToolEvent } from '@/lib/chat/tool-events';
import type { MessagePart } from './types';

const TOOL_STATES = {
  running: 'working',
  succeeded: 'succeeded',
  failed: 'failed',
  denied: 'cancelled',
  'needs-approval': 'pending',
} as const;

export function resolveToolStatuses(
  events: readonly PersistedToolEvent[],
  parts: readonly MessagePart[],
  active: boolean
): ReadonlyMap<string, OperationStatus> {
  // The last observation owns a call. A new live part clears an older receipt.
  const receipts = new Map(
    parts.flatMap(part =>
      'toolCallId' in part
        ? [[part.toolCallId, part.persistedToolReceipt] as const]
        : []
    )
  );
  return new Map(
    events.map(event => [
      event.toolCallId,
      resolveOperationStatus({
        operationKey: event.toolCallId,
        state: TOOL_STATES[event.state] ?? 'unknown',
        active,
        receipt: receipts.get(event.toolCallId),
      }),
    ])
  );
}
