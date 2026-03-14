'use client';

import { useMutation } from '@tanstack/react-query';
import { createMutationFn } from './fetch';
import { handleMutationError, handleMutationSuccess } from './mutation-utils';

export interface BatchResult {
  input: string;
  status: 'success' | 'skipped' | 'error';
  reason?: string;
  username?: string;
}

export interface BatchIngestApiResponse {
  results: BatchResult[];
  summary: {
    total: number;
    success: number;
    skipped: number;
    error: number;
  };
}

export interface BatchIngestInput {
  urls: string[];
}

const batchIngestFn = createMutationFn<
  BatchIngestInput,
  BatchIngestApiResponse
>('/api/admin/batch-ingest', 'POST');

/**
 * Mutation hook for batch URL ingestion.
 *
 * @example
 * const { mutateAsync, isPending } = useBatchIngestMutation({ onSuccess: () => refresh() });
 * await mutateAsync({ urls: ['https://linktr.ee/artist'] });
 */
export function useBatchIngestMutation(options?: {
  onSuccess?: (data: BatchIngestApiResponse) => void;
}) {
  return useMutation({
    mutationFn: batchIngestFn,
    onSuccess: data => {
      handleMutationSuccess(
        `Batch complete: ${data.summary.success} created, ${data.summary.skipped} skipped, ${data.summary.error} errors.`
      );
      options?.onSuccess?.(data);
    },
    onError: error => handleMutationError(error, 'Batch ingest failed.'),
  });
}
