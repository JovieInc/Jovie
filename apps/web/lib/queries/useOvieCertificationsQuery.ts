'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OvieCertificationDecisionRequest,
  OvieCertificationInventory,
  OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import { FREQUENT_CACHE } from './cache-strategies';
import { FetchError, fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export const OVIE_CERTIFICATIONS_ENDPOINT = '/api/ovie/certifications';
export const OVIE_CERTIFICATION_DECISIONS_ENDPOINT =
  '/api/ovie/certifications/decisions';

/** Overnight workers land packets continuously; a minute keeps the table live. */
export const OVIE_CERTIFICATIONS_REFETCH_MS = 60 * 1000;

export function useOvieCertificationsQuery() {
  return useQuery({
    queryKey: queryKeys.admin.certifications(),
    queryFn: ({ signal }) =>
      fetchWithTimeout<OvieCertificationInventory>(
        OVIE_CERTIFICATIONS_ENDPOINT,
        { signal, timeout: 20_000 }
      ),
    ...FREQUENT_CACHE,
    refetchInterval: OVIE_CERTIFICATIONS_REFETCH_MS,
    retry: 1,
  });
}

/** Server message for a failed decision, falling back to a generic line. */
export function getCertificationDecisionErrorMessage(error: unknown): string {
  if (error instanceof FetchError) {
    const message = error.parsedBody?.message;
    if (typeof message === 'string' && message.length > 0) return message;
    if (error.status === 401) return 'Sign in again to record decisions.';
    if (error.status === 403) return 'Only a founder admin can decide.';
  }
  return 'The decision could not be recorded. Try again.';
}

export function useOvieCertificationDecisionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: OvieCertificationDecisionRequest) =>
      fetchWithTimeout<{ row: OvieCertificationRow }>(
        OVIE_CERTIFICATION_DECISIONS_ENDPOINT,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      ),
    onSuccess: ({ row }) => {
      // Swap the decided row in place so selection and scroll stay put.
      queryClient.setQueryData<OvieCertificationInventory>(
        queryKeys.admin.certifications(),
        current =>
          current
            ? {
                ...current,
                rows: current.rows.map(existing =>
                  existing.id === row.id ? row : existing
                ),
              }
            : current
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.certifications(),
      });
    },
  });
}
