/**
 * Durable, bounded post-onboarding side effects (sync + trial activation).
 * Uses Next.js after() so work survives redirect() teardown on Vercel.
 */

import * as Sentry from '@sentry/nextjs';
import { after } from 'next/server';

import { syncAllClerkMetadata } from '@/lib/auth/clerk-sync';
import { captureError } from '@/lib/error-tracking';
import { withTimeout } from '@/lib/resilience/primitives';
import { syncCanonicalUsernameFromApp } from '@/lib/username/sync';

export const POST_ONBOARDING_SIDE_EFFECT_TIMEOUT_MS = 2_000;

export function schedulePostOnboardingWork(task: () => Promise<void>): void {
  try {
    after(task);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('outside a request scope')
    ) {
      queueMicrotask(() => {
        void task();
      });
      return;
    }

    throw error;
  }
}

export async function runBoundedPostOnboardingSideEffect(
  context: string,
  operation: () => Promise<void>,
  contextData?: Record<string, string | null | undefined>
): Promise<void> {
  try {
    await withTimeout(operation(), {
      timeoutMs: POST_ONBOARDING_SIDE_EFFECT_TIMEOUT_MS,
      context,
    });
  } catch (error) {
    await captureError(`${context} failed`, error, {
      route: 'onboarding',
      contextData,
    });
  }
}

async function runBoundedBackgroundSyncOperations(
  userId: string,
  username: string
): Promise<void> {
  const results = await Promise.allSettled([
    withTimeout(syncCanonicalUsernameFromApp(userId, username), {
      timeoutMs: POST_ONBOARDING_SIDE_EFFECT_TIMEOUT_MS,
      context: 'onboarding_username_sync',
    }),
    withTimeout(syncAllClerkMetadata(userId), {
      timeoutMs: POST_ONBOARDING_SIDE_EFFECT_TIMEOUT_MS,
      context: 'onboarding_metadata_sync',
    }),
  ]);

  const syncContexts = [
    'onboarding_username_sync',
    'onboarding_metadata_sync',
  ] as const;

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      Sentry.captureException(result.reason, {
        tags: { context: syncContexts[index], username },
        level: 'warning',
      });
    }
  }
}

async function runBoundedActivateTrial(userId: string): Promise<void> {
  const { activateTrial } = await import('./activate-trial');
  const activated = await activateTrial(userId);

  Sentry.addBreadcrumb({
    category: 'onboarding',
    message: activated ? 'Trial activated' : 'Trial activation skipped',
    level: 'info',
    data: { userId, activated },
  });
}

function createPostOnboardingFinalizeWork(
  userId: string,
  username: string
): () => Promise<void> {
  return async () => {
    await Promise.allSettled([
      runBoundedPostOnboardingSideEffect(
        'onboarding_background_sync',
        () => runBoundedBackgroundSyncOperations(userId, username),
        { userId, username }
      ),
      runBoundedPostOnboardingSideEffect(
        'activate_trial',
        () => runBoundedActivateTrial(userId),
        { userId }
      ),
    ]);
  };
}

/**
 * Schedules durable post-onboarding sync + trial activation via after(),
 * then best-effort awaits the same work before redirect/handoff.
 */
export async function finalizePostOnboarding(
  userId: string,
  username: string
): Promise<void> {
  let workPromise: Promise<void> | null = null;
  const getWork = () => {
    workPromise ??= createPostOnboardingFinalizeWork(userId, username)();
    return workPromise;
  };

  schedulePostOnboardingWork(getWork);
  await runBoundedPostOnboardingSideEffect(
    'post_onboarding_finalize',
    getWork,
    {
      userId,
      username,
    }
  );
}
