'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { instantiateReleaseTasksFromCatalog } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { buildReleaseTasksRoute } from '@/constants/routes';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';

/**
 * Returns true when the error is a TasksUpgradeRequiredError that crossed the
 * Server Action boundary. instanceof checks are unreliable across that boundary,
 * so we match on the serialised `name` field that Next.js preserves in the
 * re-thrown client-side Error, with a fallback on the `code` property for
 * cases where the error object was constructed directly (e.g. in unit tests).
 *
 * These are expected business-logic gates, not bugs — do not report to Sentry.
 */
function isUpgradeRequiredError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TasksUpgradeRequiredError') {
    return true;
  }
  const code =
    error !== null && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  if (
    typeof code === 'string' &&
    (code === 'RELEASE_PLAN_LOCKED' || code === 'TASKS_WORKSPACE_LOCKED')
  ) {
    return true;
  }
  return false;
}

export async function generateReleasePlanTasks(
  releaseId: string,
  context?: ReleaseContext
): Promise<string> {
  if (context) {
    await instantiateReleaseTasksFromCatalog(releaseId, context);
  } else {
    await instantiateReleaseTasks(releaseId);
  }

  return buildReleaseTasksRoute(releaseId);
}

interface UsePostCreateReleasePlanOptions {
  readonly router: {
    push: (href: string) => void;
  };
  readonly captureContext: string;
}

export function usePostCreateReleasePlan({
  router,
  captureContext,
}: UsePostCreateReleasePlanOptions) {
  const [postCreateRelease, setPostCreateRelease] =
    useState<ReleaseViewModel | null>(null);
  const [isPostCreatePlanModalOpen, setIsPostCreatePlanModalOpen] =
    useState(false);
  const [isGeneratingReleasePlan, setIsGeneratingReleasePlan] = useState(false);

  const openPostCreatePlanModal = useCallback((release: ReleaseViewModel) => {
    setPostCreateRelease(release);
    setIsPostCreatePlanModalOpen(true);
  }, []);

  const closePostCreatePlanModal = useCallback(() => {
    if (isGeneratingReleasePlan) {
      return;
    }

    setIsPostCreatePlanModalOpen(false);
    setPostCreateRelease(null);
  }, [isGeneratingReleasePlan]);

  const handleGenerateReleasePlan = useCallback(
    async (ctx?: ReleaseContext) => {
      if (!postCreateRelease || isGeneratingReleasePlan) {
        return;
      }

      setIsGeneratingReleasePlan(true);
      try {
        const releaseTasksPath = await generateReleasePlanTasks(
          postCreateRelease.id,
          ctx
        );
        setIsPostCreatePlanModalOpen(false);
        setPostCreateRelease(null);
        router.push(releaseTasksPath);
      } catch (error) {
        if (isUpgradeRequiredError(error)) {
          // Expected entitlement gate — not a bug, do not report to Sentry.
          toast.error(
            'Release plans require a Pro plan. Upgrade to unlock this feature.'
          );
        } else {
          captureError('Failed to generate release plan', error, {
            context: captureContext,
            releaseId: postCreateRelease.id,
            action: 'generate-release-plan',
          });
          toast.error('Failed to generate the release plan. Try again.');
        }
      } finally {
        setIsGeneratingReleasePlan(false);
      }
    },
    [captureContext, isGeneratingReleasePlan, postCreateRelease, router]
  );

  return {
    postCreateRelease,
    isPostCreatePlanModalOpen,
    isGeneratingReleasePlan,
    openPostCreatePlanModal,
    closePostCreatePlanModal,
    handleGenerateReleasePlan,
  };
}
