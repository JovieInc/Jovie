import type { MessagePart } from '@/components/jovie/types';
import { extractUIMessageText } from '@/lib/chat/request-validation';
import type { ChatNavMessage, ThreadTurn } from './types';

export const THREAD_NAV_PREVIEW_MAX_CHARS = 96;

function extractPreviewText(parts: readonly MessagePart[]): string {
  return extractUIMessageText(parts as MessagePart[])
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateThreadPreview(
  text: string,
  maxChars = THREAD_NAV_PREVIEW_MAX_CHARS
): string {
  if (text.length <= maxChars) {
    return text;
  }

  const slice = text.slice(0, maxChars - 1).trimEnd();
  const lastSpace = slice.lastIndexOf(' ');
  const trimmed =
    lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;

  return `${trimmed}…`;
}

export function deriveThreadTurns(
  messages: readonly ChatNavMessage[]
): readonly ThreadTurn[] {
  const turns: ThreadTurn[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== 'user') {
      continue;
    }

    let preview = extractPreviewText(message.parts);
    if (!preview) {
      const nextMessage = messages[index + 1];
      if (nextMessage?.role === 'assistant') {
        preview = extractPreviewText(nextMessage.parts);
      }
    }

    const turnNumber = turns.length + 1;
    turns.push({
      id: message.clientTurnId ?? message.id,
      messageIndex: index,
      preview: preview ? truncateThreadPreview(preview) : `Turn ${turnNumber}`,
      turnNumber,
    });
  }

  return turns;
}
