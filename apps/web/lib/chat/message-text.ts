import type { UIMessage } from 'ai';
import { extractUIMessageText } from '@/lib/chat/request-validation';

type MessagePart = { type: string; text?: string };

/**
 * Returns trimmed text from the most recent user message in a UIMessage thread.
 * Compute once per chat turn and pass through intent routing + model heuristics.
 */
export function extractLastUserText(uiMessages: UIMessage[]): string {
  const lastUserMsg = [...uiMessages]
    .reverse()
    .find(message => message.role === 'user');
  if (!lastUserMsg) {
    return '';
  }

  return extractUIMessageText(lastUserMsg.parts as MessagePart[]).trim();
}
