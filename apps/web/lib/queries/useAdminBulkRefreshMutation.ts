'use client';

import { useMutation } from '@tanstack/react-query';
import { APP_ROUTES } from '@/constants/routes';
import { createMutationFn } from './fetch';
import { handleMutationError } from './mutation-utils';

interface BulkRefreshInput {
  profileIds: string[];
}

interface BulkRefreshResponse {
  queuedCount?: number;
}

const bulkRefreshCreators = createMutationFn<
  BulkRefreshInput,
  BulkRefreshResponse
>(APP_ROUTES.ADMIN_CREATORS_BULK_REFRESH, 'POST');

/**
 * TanStack Query mutation hook for bulk-refreshing MusicFetch data
 * for selected creator profiles (admin).
 *
 * @example
 * const { mutateAsync: bulkRefresh } = useAdminBulkRefreshMutation();
 * const result = await bulkRefresh({ profileIds: ['id1', 'id2'] });
 */
export function useAdminBulkRefreshMutation() {
  return useMutation({
    mutationFn: bulkRefreshCreators,
    onError: error => {
      handleMutationError(error, 'Failed to queue MusicFetch refresh');
    },
  });
}
