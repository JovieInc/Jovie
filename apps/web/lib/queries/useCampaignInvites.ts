'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const MINUTE = 60 * 1000;

// Types
interface EligibleProfile {
  id: string;
  username: string;
  displayName: string | null;
  fitScore: number | null;
  email: string;
}

export interface CampaignPreviewResponse {
  ok: boolean;
  threshold: number;
  totalEligible: number;
  sample: {
    withEmails: number;
    withoutEmails: number;
    profiles: EligibleProfile[];
  };
}

export interface SendCampaignInvitesInput {
  fitScoreThreshold: number;
  limit: number;
  minDelayMs: number;
  maxDelayMs: number;
  maxPerHour: number;
  dryRun?: boolean;
}

export interface SendCampaignInvitesResponse {
  ok: boolean;
  sent?: number;
  jobsEnqueued?: number;
  skippedNoEmail?: number;
  estimatedMinutes?: number;
  error?: string;
}

// Query keys
export const campaignQueryKeys = {
  all: ['campaign-invites'] as const,
  preview: (threshold: number, limit: number) =>
    [...campaignQueryKeys.all, 'preview', { threshold, limit }] as const,
};

/**
 * Query function for fetching campaign invite preview.
 */
async function fetchCampaignPreview(
  threshold: number,
  limit: number
): Promise<CampaignPreviewResponse> {
  const response = await fetch(
    `/api/admin/creator-invite/bulk?threshold=${threshold}&limit=${limit}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to fetch preview');
  }

  return data;
}

/**
 * Mutation function for sending campaign invites.
 */
async function sendCampaignInvites(
  input: SendCampaignInvitesInput
): Promise<SendCampaignInvitesResponse> {
  const response = await fetch('/api/admin/creator-invite/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to send invites');
  }

  return data;
}

/**
 * TanStack Query hook for fetching campaign invite preview.
 *
 * @example
 * const { data: preview, isLoading, refetch } = useCampaignPreviewQuery({
 *   threshold: 50,
 *   limit: 20,
 * });
 */
export function useCampaignPreviewQuery({
  threshold,
  limit,
  enabled = true,
}: {
  threshold: number;
  limit: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: campaignQueryKeys.preview(threshold, limit),
    queryFn: () => fetchCampaignPreview(threshold, limit),
    enabled,
    staleTime: 1 * MINUTE,
    gcTime: 5 * MINUTE,
  });
}

/**
 * TanStack Query mutation hook for sending campaign invites.
 *
 * @example
 * const { mutate: sendInvites, isPending } = useSendCampaignInvitesMutation();
 *
 * sendInvites(
 *   {
 *     fitScoreThreshold: 50,
 *     limit: 20,
 *     minDelayMs: 30000,
 *     maxDelayMs: 120000,
 *     maxPerHour: 30,
 *   },
 *   {
 *     onSuccess: (data) => toast.success(`Queued ${data.jobsEnqueued} invites`),
 *     onError: (error) => toast.error(error.message),
 *   }
 * );
 */
export function useSendCampaignInvitesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendCampaignInvites,
    onSettled: () => {
      // Invalidate preview queries to refetch after sending
      queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all });
    },
  });
}
