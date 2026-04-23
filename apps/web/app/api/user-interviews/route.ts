/**
 * POST /api/user-interviews
 *
 * Persists a Mom Test interview transcript captured after onboarding.
 * Idempotent on `(userId, source)` via a unique index — duplicate submits
 * return `{ deduped: true }`. Summarization runs asynchronously via the
 * /api/cron/summarize-interviews cron handler.
 */

import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOptionalAuth } from '@/lib/auth/cached';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  type InterviewTranscriptEntry,
  userInterviews,
} from '@/lib/db/schema/user-interviews';
import { captureError } from '@/lib/error-tracking';

export const runtime = 'nodejs';

const transcriptEntrySchema = z.object({
  questionId: z.string().min(1).max(128),
  prompt: z.string().min(1).max(2000),
  answer: z.string().max(5000).nullable(),
  skipped: z.boolean(),
  timestamp: z.string().min(1),
});

const requestSchema = z.object({
  source: z.string().min(1).max(64).default('onboarding'),
  transcript: z.array(transcriptEntrySchema).min(1).max(50),
  metadata: z
    .object({
      persona: z.string().max(64).optional().nullable(),
      plan: z.string().max(64).optional().nullable(),
      locale: z.string().max(32).optional().nullable(),
      userAgent: z.string().max(512).optional().nullable(),
    })
    .default({}),
});

export async function POST(request: Request) {
  try {
    const { userId: clerkId } = await getOptionalAuth();
    if (!clerkId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { source, transcript, metadata } = parsed.data;

    const inserted = await db
      .insert(userInterviews)
      .values({
        userId: user.id,
        source,
        transcript: transcript as InterviewTranscriptEntry[],
        metadata,
        status: 'pending',
      })
      .onConflictDoNothing({
        target: [userInterviews.userId, userInterviews.source],
      })
      .returning({ id: userInterviews.id });

    if (inserted.length === 0) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    return NextResponse.json({ ok: true, id: inserted[0].id });
  } catch (error) {
    await captureError('user-interview submission failed', error, {
      route: '/api/user-interviews',
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
