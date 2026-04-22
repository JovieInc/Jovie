/**
 * Cron handler that summarizes pending user interviews via Claude Haiku.
 *
 * Claims up to N rows in status='pending', flips them to 'summarizing',
 * calls the LLM, writes the summary + metadata, and flips to 'summarized'.
 * Failures bump `summaryAttempts`; rows that fail 3+ times are moved to
 * 'failed'. The claim uses FOR UPDATE SKIP LOCKED so concurrent cron
 * invocations cannot double-process the same row.
 *
 * Schedule: every 5 minutes (configured in vercel.json).
 */

import { and, sql as drizzleSql, eq, lte } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cron/auth';
import { db } from '@/lib/db';
import { userInterviews } from '@/lib/db/schema/user-interviews';
import { captureError } from '@/lib/error-tracking';
import { summarizeInterview } from '@/lib/interviews/summarize';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const MAX_INTERVIEWS_PER_RUN = 10;
const MAX_ATTEMPTS = 3;

async function claimPendingInterviews(limit: number) {
  return db
    .update(userInterviews)
    .set({
      status: 'summarizing',
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      drizzleSql`${userInterviews.id} IN (
        SELECT ${userInterviews.id}
        FROM ${userInterviews}
        WHERE ${userInterviews.status} = 'pending'
          AND ${userInterviews.summaryAttempts} < ${MAX_ATTEMPTS}
        ORDER BY ${userInterviews.createdAt} ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )`
    )
    .returning({
      id: userInterviews.id,
      transcript: userInterviews.transcript,
      metadata: userInterviews.metadata,
      attempts: userInterviews.summaryAttempts,
    });
}

export async function GET(request: Request) {
  const authError = verifyCronRequest(request, {
    route: '/api/cron/summarize-interviews',
  });
  if (authError) return authError;

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const claimed = await claimPendingInterviews(MAX_INTERVIEWS_PER_RUN);
    attempted = claimed.length;

    for (const row of claimed) {
      try {
        const { structured, summaryText } = await summarizeInterview(
          row.transcript
        );
        await db
          .update(userInterviews)
          .set({
            status: 'summarized',
            summary: summaryText,
            summaryAttempts: row.attempts + 1,
            metadata: {
              ...row.metadata,
              summary_structured: structured,
              summary_error: null,
            },
            claimedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(userInterviews.id, row.id));
        succeeded += 1;
      } catch (err) {
        failed += 1;
        const nextAttempts = row.attempts + 1;
        const nextStatus = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        const message = err instanceof Error ? err.message : String(err);

        await db
          .update(userInterviews)
          .set({
            status: nextStatus,
            summaryAttempts: nextAttempts,
            metadata: {
              ...row.metadata,
              summary_error: message.slice(0, 500),
            },
            claimedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(userInterviews.id, row.id));

        await captureError('Interview summarization failed', err, {
          route: '/api/cron/summarize-interviews',
          interviewId: row.id,
          attempts: nextAttempts,
        });
      }
    }

    // Sweep: any 'summarizing' rows older than 10 minutes without updates
    // are almost certainly from a crashed run. Count the failed attempt so a
    // permanently crashing row eventually reaches the terminal failed state.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await db
      .update(userInterviews)
      .set({
        status: drizzleSql`CASE
          WHEN ${userInterviews.summaryAttempts} + 1 >= ${MAX_ATTEMPTS}
          THEN 'failed'
          ELSE 'pending'
        END`,
        summaryAttempts: drizzleSql`${userInterviews.summaryAttempts} + 1`,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userInterviews.status, 'summarizing'),
          lte(userInterviews.claimedAt, tenMinutesAgo)
        )
      );

    return NextResponse.json(
      { ok: true, attempted, succeeded, failed },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    logger.error('summarize-interviews cron error', {
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : String(error),
    });
    await captureError('summarize-interviews cron failed', error, {
      route: '/api/cron/summarize-interviews',
    });
    return NextResponse.json(
      { error: 'Cron run failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
