import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatTurns } from '@/lib/db/schema/chat';
import { logger } from '@/lib/utils/logger';

interface ChunkEvent {
  chunk: { type: string; text?: string };
}

/**
 * Time-to-first-visible-word marker. Returns a streamText `onChunk` handler
 * that stamps chat_turns.first_text_at once, on the first non-empty text
 * delta. Fire-and-forget and fail-soft: never blocks or fails the stream.
 */
export function createFirstTextMarker(
  turnId: string
): (event: ChunkEvent) => void {
  let marked = false;
  return ({ chunk }) => {
    if (marked || chunk.type !== 'text-delta' || !chunk.text?.trim()) return;
    marked = true;
    const warn = (error: unknown) =>
      logger.warn('Chat turn first_text_at mark failed', {
        turnId,
        error: error instanceof Error ? error.message : String(error),
      });
    try {
      Promise.resolve(
        db
          .update(chatTurns)
          .set({ firstTextAt: new Date() })
          .where(and(eq(chatTurns.id, turnId), isNull(chatTurns.firstTextAt)))
      ).catch(warn);
    } catch (error) {
      warn(error);
    }
  };
}
