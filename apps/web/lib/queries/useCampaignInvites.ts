'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithTimeout } from './fetch';

const MINUTE = 60 * 1000;
const SECONDS = 1000;

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

export interface CampaignStats {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  claimed: number;
}

export interface JobQueueStats {
  pending: number;
  processing: number;
  succeeded: number;
  failed: number;
  nextRunAt: string | null;
  estimatedMinutesRemaining: number;
}

export interface CampaignStatsResponse {
  ok: boolean;
  campaign: CampaignStats;
  jobQueue: JobQueueStats;
  updatedAt: string;
}

// Query keys
export const campaignQueryKeys = {
  all: ['campaign-invites'] as const,
  preview: (threshold: number, limit: number) =>
    [...campaignQueryKeys.all, 'preview', { threshold, limit }] as const,
  stats: () => [...campaignQueryKeys.all, 'stats'] as const,
};

/**
 * Query function for fetching campaign invite preview.
 */
async function fetchCampaignPreview(
  threshold: number,
  limit: number
): Promise<CampaignPreviewResponse> {
  return fetchWithTimeout<CampaignPreviewResponse>(
    `/api/admin/creator-invite/bulk?threshold=${threshold}&limit=${limit}`
  );
}

/**
 * Mutation function for sending campaign invites.
 */
async function sendCampaignInvites(
  input: SendCampaignInvitesInput
): Promise<SendCampaignInvitesResponse> {
  return fetchWithTimeout<SendCampaignInvitesResponse>(
    '/api/admin/creator-invite/bulk',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
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
      // Invalidate preview and stats queries to refetch after sending
      queryClient.invalidateQueries({ queryKey: campaignQueryKeys.all });
    },
  });
}

/**
 * Query function for fetching campaign stats.
 */
async function fetchCampaignStats(): Promise<CampaignStatsResponse> {
  return fetchWithTimeout<CampaignStatsResponse>(
    '/api/admin/creator-invite/bulk/stats'
  );
}

/**
 * TanStack Query hook for fetching campaign statistics.
 * Polls every 30 seconds when there are pending jobs.
 *
 * @example
 * const { data: stats, isLoading } = useCampaignStatsQuery();
 * console.log(stats?.campaign.sent); // Number of sent invites
 * console.log(stats?.jobQueue.pending); // Pending jobs in queue
 */
export function useCampaignStatsQuery({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  return useQuery({
    queryKey: campaignQueryKeys.stats(),
    queryFn: fetchCampaignStats,
    enabled,
    staleTime: 30 * SECONDS,
    gcTime: 5 * MINUTE,
    refetchInterval: query => {
      // Poll every 30 seconds if there are pending/processing jobs
      const data = query.state.data;
      if (data?.jobQueue.pending || data?.jobQueue.processing) {
        return 30 * SECONDS;
      }
      return false;
    },
  });
}
