import type { MessagePart } from '@/components/jovie/types';
import { extractUIMessageText } from '@/lib/chat/request-validation';
import type { ChatNavMessage, ThreadTurn } from './types';

export const THREAD_NAV_PREVIEW_MAX_CHARS = 96;

function extractPreviewText(parts: readonly MessagePart[]): string {
  return truncateThreadPreview(
    extractUIMessageText(parts as MessagePart[])
      .replace(/\s+/g, ' ')
      .trim()
  );
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
  return buildThreadTurns(messages, message =>
    extractPreviewText(message.parts)
  );
}

interface PreviewSnapshot {
  readonly parts: ChatNavMessage['parts'];
  readonly revision: number | undefined;
  readonly text: string;
}

/** Reconcile snapshots cheaply; only changed preview sources require text work. */
export function createThreadTurnProjector() {
  let previousScope: string | null = null;
  let previews = new Map<ChatNavMessage, PreviewSnapshot>();
  let previousTurns: readonly ThreadTurn[] = [];

  return (
    messages: readonly ChatNavMessage[],
    scopeKey: string | null = null
  ): readonly ThreadTurn[] => {
    if (previousScope !== scopeKey) {
      previews.clear();
      previousTurns = [];
      previousScope = scopeKey;
    }

    const retained = new Map<ChatNavMessage, PreviewSnapshot>();
    const turns = buildThreadTurns(messages, message => {
      const cached = previews.get(message);
      // Canonical rows are immutable. Replacements conservatively miss even
      // when parts are shared; revisions also invalidate an aliased stream.
      const snapshot =
        cached &&
        cached.parts === message.parts &&
        cached.revision === message.streamRevision
          ? cached
          : {
              parts: message.parts,
              revision: message.streamRevision,
              text: extractPreviewText(message.parts),
            };
      retained.set(message, snapshot);
      return snapshot.text;
    });
    // Keep only the current user/fallback sources, including after removals.
    previews = retained;
    if (
      turns.length === previousTurns.length &&
      turns.every((turn, index) => {
        const previous = previousTurns[index];
        return (
          turn.id === previous.id &&
          turn.messageIndex === previous.messageIndex &&
          turn.turnNumber === previous.turnNumber &&
          turn.preview === previous.preview
        );
      })
    ) {
      return previousTurns;
    }
    previousTurns = turns;
    return turns;
  };
}

function buildThreadTurns(
  messages: readonly ChatNavMessage[],
  readPreview: (message: ChatNavMessage) => string
): readonly ThreadTurn[] {
  const turns: ThreadTurn[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== 'user') {
      continue;
    }

    let preview = readPreview(message);
    if (!preview) {
      const nextMessage = messages[index + 1];
      if (nextMessage?.role === 'assistant') {
        preview = readPreview(nextMessage);
      }
    }

    const turnNumber = turns.length + 1;
    turns.push({
      id: message.clientTurnId ?? message.id,
      messageIndex: index,
      preview: preview || `Turn ${turnNumber}`,
      turnNumber,
    });
  }

  return turns;
}
