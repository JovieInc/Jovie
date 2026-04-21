import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import {
  createUserAndProfile,
  fetchExistingUser,
} from '@/app/onboarding/actions/profile-setup';
import { withDbSessionTx } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  productFunnelEvents,
  productSyntheticRuns,
} from '@/lib/db/schema/product-funnel';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { captureError } from '@/lib/error-tracking';
import { recordProductFunnelEvent } from '@/lib/product-funnel/events';

const MONITOR_KEY = 'synthetic_signup';
const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 25_000;

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForSignupCompleted(clerkUserId: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const [event] = await db
      .select({ id: productFunnelEvents.id })
      .from(productFunnelEvents)
      .where(
        and(
          eq(productFunnelEvents.eventType, 'signup_completed'),
          eq(productFunnelEvents.actorKey, `clerk:${clerkUserId}`),
          eq(productFunnelEvents.isSynthetic, true)
        )
      )
      .limit(1);

    if (event) {
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error('Timed out waiting for synthetic signup_completed event');
}

export async function runSyntheticSignupMonitor(now = new Date()) {
  const [run] = await db
    .insert(productSyntheticRuns)
    .values({
      monitorKey: MONITOR_KEY,
      status: 'running',
      startedAt: now,
      details: {},
    })
    .returning({
      id: productSyntheticRuns.id,
    });

  const syntheticId = now.getTime().toString(36);
  const email = `synthetic-signup+${syntheticId}@jovie.invalid`;
  const username = `synthetic${syntheticId}`;
  const displayName = 'Synthetic Monitor';
  const clerk = await clerkClient();

  let clerkUserId: string | null = null;
  let dbUserId: string | null = null;
  let profileId: string | null = null;

  try {
    const createdUser = await clerk.users.createUser({
      emailAddress: [email],
      username,
      firstName: 'Synthetic',
      lastName: 'Monitor',
      skipPasswordRequirement: true,
      publicMetadata: {
        jovieSyntheticMonitor: true,
      },
    });
    clerkUserId = createdUser.id;

    await waitForSignupCompleted(clerkUserId);

    const completion = await withDbSessionTx(
      async (tx, resolvedClerkUserId) => {
        const result = await createUserAndProfile(
          tx,
          resolvedClerkUserId,
          email,
          username,
          displayName
        );
        const dbUser = await fetchExistingUser(tx, resolvedClerkUserId);
        return {
          dbUserId: dbUser?.id ?? null,
          profileId: result.profileId ?? null,
        };
      },
      { clerkUserId }
    );

    dbUserId = completion.dbUserId;
    profileId = completion.profileId;

    if (!dbUserId || !profileId) {
      throw new Error('Synthetic signup did not create a DB user and profile');
    }

    await recordProductFunnelEvent({
      eventType: 'onboarding_completed',
      userId: dbUserId,
      creatorProfileId: profileId,
      isSynthetic: true,
      occurredAt: now,
      idempotencyKey: `synthetic:onboarding_completed:${run.id}`,
    });
    await recordProductFunnelEvent({
      eventType: 'activated',
      userId: dbUserId,
      creatorProfileId: profileId,
      isSynthetic: true,
      occurredAt: now,
      idempotencyKey: `synthetic:activated:${run.id}`,
    });

    await db
      .update(productSyntheticRuns)
      .set({
        status: 'success',
        finishedAt: new Date(),
        error: null,
        details: {
          clerkUserId,
          dbUserId,
          profileId,
        },
      })
      .where(eq(productSyntheticRuns.id, run.id));

    return {
      status: 'success' as const,
      clerkUserId,
      dbUserId,
      profileId,
    };
  } catch (error) {
    await db
      .update(productSyntheticRuns)
      .set({
        status: 'failure',
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          clerkUserId,
          dbUserId,
          profileId,
        },
      })
      .where(eq(productSyntheticRuns.id, run.id));
    throw error;
  } finally {
    if (profileId) {
      await db
        .delete(creatorProfiles)
        .where(eq(creatorProfiles.id, profileId))
        .catch(error =>
          captureError('Synthetic signup cleanup failed', error, {
            route: 'lib/monitors/synthetic-signup',
            monitorKey: MONITOR_KEY,
            runId: run.id,
            clerkUserId,
            dbUserId,
            profileId,
            step: 'profile',
          })
        );
    }

    if (dbUserId) {
      await db
        .delete(users)
        .where(eq(users.id, dbUserId))
        .catch(error =>
          captureError('Synthetic signup cleanup failed', error, {
            route: 'lib/monitors/synthetic-signup',
            monitorKey: MONITOR_KEY,
            runId: run.id,
            clerkUserId,
            dbUserId,
            profileId,
            step: 'db_user',
          })
        );
    }

    if (clerkUserId) {
      await clerk.users.deleteUser(clerkUserId).catch(error =>
        captureError('Synthetic signup cleanup failed', error, {
          route: 'lib/monitors/synthetic-signup',
          monitorKey: MONITOR_KEY,
          runId: run.id,
          clerkUserId,
          dbUserId,
          profileId,
          step: 'clerk_user',
        })
      );
    }
  }
}
