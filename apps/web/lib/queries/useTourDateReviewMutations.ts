'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  confirmEvent,
  type EventActionResult,
  rejectEvent,
  undoRejectEvent,
} from '@/app/app/(shell)/dashboard/tour-dates/events-actions';

function assertOk(result: EventActionResult, failureMessage: string): void {
  if (!result.ok) {
    throw new Error(failureMessage);
  }
}

/**
 * Confirm / reject / undo-reject mutations for detected tour dates in the
 * Opportunity Inbox. Wraps the trust-gate server actions from the tour-dates
 * dashboard so both surfaces share one moderation path.
 */
export function useTourDateReviewMutations() {
  const router = useRouter();

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      assertOk(await confirmEvent(id), 'Unable to confirm tour date');
    },
    onSuccess: () => {
      toast.success('Tour date confirmed — it now shows on your profile.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to confirm tour date'
      );
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      assertOk(await rejectEvent(id), 'Unable to reject tour date');
    },
    onSuccess: () => {
      toast.success('Tour date rejected — moved to your rejected list.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to reject tour date'
      );
    },
  });

  const undoRejectMutation = useMutation({
    mutationFn: async (id: string) => {
      assertOk(await undoRejectEvent(id), 'Unable to restore tour date');
    },
    onSuccess: () => {
      toast.success('Tour date restored to review.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to restore tour date'
      );
    },
  });

  return { confirmMutation, rejectMutation, undoRejectMutation };
}
