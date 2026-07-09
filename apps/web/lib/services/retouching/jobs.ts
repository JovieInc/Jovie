import 'server-only';

import { and, count, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { retouchJobs } from '@/lib/db/schema/agents';
import { users } from '@/lib/db/schema/auth';

/**
 * retouch_jobs lifecycle helpers. One row per retouch invocation:
 * queued -> running -> completed | failed | identity_check_failed.
 */

export async function resolveRetouchUserId(
  clerkUserId: string
): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Number of model-consuming retouch jobs the user started since `since`.
 * Failed jobs are intentionally excluded so provider errors never burn the
 * user's daily budget (graceful-degrade guardrail). Backed by
 * retouch_jobs_user_status_idx.
 */
export async function countRetouchJobsSince(params: {
  readonly userId: string;
  readonly since: Date;
}): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(retouchJobs)
    .where(
      and(
        eq(retouchJobs.userId, params.userId),
        inArray(retouchJobs.status, ['running', 'completed']),
        gte(retouchJobs.createdAt, params.since)
      )
    );
  return rows[0]?.value ?? 0;
}

export async function createRetouchJob(params: {
  readonly userId: string;
  readonly sourceAssetId: string;
  readonly model: string;
  readonly style: string;
  readonly styleVersion: string;
  readonly perImageOverride: string | null;
  readonly chatThreadId: string | null;
}): Promise<string> {
  const rows = await db
    .insert(retouchJobs)
    .values({
      userId: params.userId,
      sourceAssetId: params.sourceAssetId,
      model: params.model,
      style: params.style,
      styleVersion: params.styleVersion,
      perImageOverride: params.perImageOverride,
      chatThreadId: params.chatThreadId,
      status: 'queued',
    })
    .returning({ id: retouchJobs.id });

  const id = rows[0]?.id;
  if (!id) {
    throw new TypeError('Failed to create retouch job');
  }
  return id;
}

export async function markRetouchJobRunning(jobId: string): Promise<void> {
  await db
    .update(retouchJobs)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(retouchJobs.id, jobId));
}

export async function completeRetouchJob(params: {
  readonly jobId: string;
  readonly resultAssetId: string;
  readonly tokenUsage: Record<string, unknown>;
}): Promise<void> {
  await db
    .update(retouchJobs)
    .set({
      status: 'completed',
      resultAssetId: params.resultAssetId,
      tokenUsage: params.tokenUsage,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(retouchJobs.id, params.jobId));
}

export async function failRetouchJob(params: {
  readonly jobId: string;
  readonly error: string;
  readonly status?: 'failed' | 'identity_check_failed';
}): Promise<void> {
  await db
    .update(retouchJobs)
    .set({
      status: params.status ?? 'failed',
      // Machine-readable detail for ops; never shown to users verbatim.
      error: params.error.slice(0, 2000),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(retouchJobs.id, params.jobId));
}
