import {
  decodeToolEvents,
  encodeToolEvents,
  toolEventToMessagePart,
} from '@/lib/chat/tool-events';
import type { MessagePart } from './types';

export function extractPersistableToolCalls(parts: readonly MessagePart[]) {
  return encodeToolEvents(parts);
}

export function hydratePersistedMessageParts(
  content: string,
  toolCalls: unknown
): MessagePart[] {
  const parts: MessagePart[] = [];

  if (content.length > 0) {
    parts.push({ type: 'text', text: content });
  }

  const decoded = decodeToolEvents(toolCalls);
  if (decoded.events.length === 0) {
    return parts;
  }

  return parts.concat(decoded.events.map(toolEventToMessagePart));
}
