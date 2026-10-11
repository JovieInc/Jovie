'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from '@/components/feedback';
import type { OpportunityInboxFeedbackRating } from '@/lib/connectors/opportunity-inbox-feedback';
import { buildOpportunityInboxFeedbackMessage } from '@/lib/connectors/opportunity-inbox-feedback';
import { fetchWithTimeout } from './fetch';

interface SuggestedActionMutationResponse {
  readonly ok?: boolean;
  readonly error?: string;
}

interface ReviseSocialReplyInput {
  readonly id: string;
  readonly comment: string;
  readonly draftedText?: string;
}

interface OpportunityInboxFeedbackInput {
  readonly suggestedActionId: string;
  readonly rating: OpportunityInboxFeedbackRating;
  readonly comment?: string;
  readonly pathname: string | null;
}

interface OpportunityInboxFeedbackResponse {
  readonly ok?: boolean;
  readonly id?: string;
  readonly error?: string;
}

async function postSuggestedAction(
  id: string,
  action: 'approve' | 'reject' | 'next-step'
): Promise<SuggestedActionMutationResponse> {
  const response = await fetch(
    `/api/connectors/suggested-actions/${id}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const body = (await response.json()) as SuggestedActionMutationResponse;

  if (!response.ok) {
    throw new Error(body.error ?? `Unable to ${action} suggestion`);
  }

  return body;
}

export function useOpportunityInboxMutations() {
  const router = useRouter();

  const approveMutation = useMutation({
    mutationFn: (id: string) => postSuggestedAction(id, 'approve'),
    onSuccess: () => {
      toast.success('Suggestion approved — Jovie is executing it now.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to approve suggestion'
      );
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => postSuggestedAction(id, 'reject'),
    onSuccess: () => {
      toast.success('Suggestion dismissed.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to dismiss suggestion'
      );
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async (input: OpportunityInboxFeedbackInput) => {
      const response = await fetchWithTimeout<OpportunityInboxFeedbackResponse>(
        '/api/feedback',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: buildOpportunityInboxFeedbackMessage(
              input.rating,
              input.comment
            ),
            source: 'opportunity-inbox',
            pathname: input.pathname,
            suggestedActionId: input.suggestedActionId,
            rating: input.rating,
          }),
        }
      );

      if (response.ok !== true) {
        throw new Error(response.error ?? 'Unable to submit feedback');
      }

      return response;
    },
    onSuccess: () => {
      toast.success('Feedback sent to Jovie.');
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to submit feedback'
      );
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async (input: ReviseSocialReplyInput) => {
      const response = await fetch(
        `/api/connectors/suggested-actions/${input.id}/revise`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: input.comment,
            ...(input.draftedText ? { draftedText: input.draftedText } : {}),
          }),
        }
      );

      const body = (await response.json()) as SuggestedActionMutationResponse;

      if (!response.ok) {
        throw new Error(body.error ?? 'Unable to request revision');
      }

      return body;
    },
    onSuccess: () => {
      toast.success('Revision requested — a new draft is on its way.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to request revision'
      );
    },
  });

  const nextStepMutation = useMutation({
    mutationFn: (id: string) => postSuggestedAction(id, 'next-step'),
    onSuccess: () => {
      toast.success('Next step queued — it will appear in your inbox.');
      router.refresh();
    },
    onError: error => {
      toast.error(
        error instanceof Error ? error.message : 'Unable to queue next step'
      );
    },
  });

  return {
    approveMutation,
    dismissMutation,
    feedbackMutation,
    reviseMutation,
    nextStepMutation,
  };
}
