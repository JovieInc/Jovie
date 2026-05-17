'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { instantiateReleaseTasksFromCatalog } from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { instantiateReleaseTasks } from '@/app/app/(shell)/dashboard/releases/task-actions';
import { buildReleaseTasksRoute } from '@/constants/routes';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { captureError } from '@/lib/error-tracking';
import type { ReleaseContext } from '@/lib/release-tasks/applicability';

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
        captureError('Failed to generate release plan', error, {
          context: captureContext,
          releaseId: postCreateRelease.id,
          action: 'generate-release-plan',
        });
        toast.error('Failed to generate the release plan. Try again.');
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
