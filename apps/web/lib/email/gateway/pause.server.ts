import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { getSummerCard } from '@/lib/ovie/summer-cards.server';
import type { EmailStream } from '../streams';

/**
 * Stream pause state, in the durable Ovie operating KV (no new table). The
 * deliverability loop writes it when a stream crosses its pause threshold and
 * files an Ovie card; approving that card resumes the stream.
 */
export interface StreamPause {
  readonly stream: EmailStream;
  readonly pausedAt: string;
  readonly reason: string;
  /** Approving this card resumes the stream. */
  readonly resumeCardId: string | null;
}

const KEY_PREFIX = 'email-stream-pause:';
export const pauseKey = (stream: EmailStream) => `${KEY_PREFIX}${stream}`;

export async function readStreamPause(
  stream: EmailStream
): Promise<StreamPause | null> {
  const [row] = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, pauseKey(stream)))
    .limit(1);
  const pause = (row?.value ?? null) as StreamPause | null;
  if (!pause) return null;
  if (pause.resumeCardId) {
    const card = await getSummerCard(pause.resumeCardId);
    if (card?.status === 'approved') {
      await clearStreamPause(stream);
      return null;
    }
  }
  return pause;
}

/** Writes the pause once; an existing pause (and its card) is kept. */
export async function pauseStream(pause: StreamPause): Promise<boolean> {
  const inserted = await db
    .insert(ovieOperatingKv)
    .values({
      key: pauseKey(pause.stream),
      value: pause,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: ovieOperatingKv.key })
    .returning({ key: ovieOperatingKv.key });
  return inserted.length === 1;
}

export async function clearStreamPause(stream: EmailStream): Promise<void> {
  await db
    .delete(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, pauseKey(stream)));
}
