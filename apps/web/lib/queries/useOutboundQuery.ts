'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContactCertificationInspection } from '@/lib/contacts/certification';
import type {
  OutboundCopy,
  OutboundQueue,
  OutboundRejectReason,
} from '@/lib/outbound/types';
import { FREQUENT_CACHE } from './cache-strategies';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export const OUTBOUND_ENDPOINT = '/api/admin/outbound';

export function useOutboundQueueQuery() {
  return useQuery({
    queryKey: queryKeys.admin.outbound(),
    queryFn: ({ signal }) =>
      fetchWithTimeout<OutboundQueue>(OUTBOUND_ENDPOINT, {
        signal,
        timeout: 20_000,
      }),
    ...FREQUENT_CACHE,
    retry: 1,
  });
}

export function useOutboundCertificationQuery(leadId: string | null) {
  return useQuery({
    queryKey: queryKeys.admin.outboundLead(leadId ?? 'none'),
    queryFn: ({ signal }) =>
      fetchWithTimeout<{
        certification: ContactCertificationInspection | null;
      }>(`${OUTBOUND_ENDPOINT}?lead=${encodeURIComponent(leadId ?? '')}`, {
        signal,
        timeout: 20_000,
      }),
    enabled: Boolean(leadId),
    ...FREQUENT_CACHE,
    retry: 1,
  });
}

interface TargetRef {
  readonly leadId: string;
  readonly expectedTargetRevision: string;
}

export type OutboundDecisionRequest =
  | (TargetRef & { readonly action: 'approve'; readonly copy: OutboundCopy })
  | (TargetRef & { readonly action: 'save_copy'; readonly copy: OutboundCopy })
  | { readonly action: 'hold'; readonly items: readonly TargetRef[] }
  | {
      readonly action: 'reject';
      readonly items: readonly TargetRef[];
      readonly reason: OutboundRejectReason;
    };

/** Server message for a refused decision, else a generic line. */
export function getOutboundDecisionErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    const message = error.parsedBody?.error;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'The decision could not be recorded. Try again.';
}

export function useOutboundDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: OutboundDecisionRequest) =>
      fetchWithTimeout<{ ok: boolean }>(OUTBOUND_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.outbound() }),
  });
}

/** Per-fact Yes / No / Unsure through the JOV-7321 contacts endpoint. */
export function useOutboundFactReviewMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: Record<string, unknown>) =>
      fetchWithTimeout<{ certification: ContactCertificationInspection }>(
        '/api/admin/contacts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.outbound() }),
  });
}
