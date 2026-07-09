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

type FilePartLike = {
  type: string;
  mediaType?: string;
  url?: string;
};

/**
 * Returns the URL of the most recent image file part attached by the user,
 * scanning user messages newest-first (chat image attachments are uploaded
 * to public blob storage client-side, so parts carry https URLs). Null when
 * no image attachment exists in the thread.
 */
export function extractLastUserImageUrl(
  uiMessages: UIMessage[]
): string | null {
  for (const message of [...uiMessages].reverse()) {
    if (message.role !== 'user') continue;
    const parts = (message.parts ?? []) as FilePartLike[];
    for (const part of [...parts].reverse()) {
      if (
        part.type === 'file' &&
        typeof part.mediaType === 'string' &&
        part.mediaType.startsWith('image/') &&
        typeof part.url === 'string' &&
        part.url.startsWith('https://')
      ) {
        return part.url;
      }
    }
  }
  return null;
}
