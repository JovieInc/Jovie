'use client';

import { useQuery } from '@tanstack/react-query';
import {
  mergedPipelineBottleneckSchema,
  PIPELINE_BOTTLENECK_API,
} from '@/lib/ovie/pipeline-bottleneck';
import { FREQUENT_CACHE, RETRY_BACKOFF } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export function usePipelineBottleneckQuery(isAdmin: boolean) {
  return useQuery({
    ...FREQUENT_CACHE,
    ...RETRY_BACKOFF,
    queryKey: queryKeys.hud.pipelineBottleneck(),
    queryFn: ({ signal }) =>
      fetchWithTimeout(PIPELINE_BOTTLENECK_API, {
        signal,
        cache: 'no-store',
        schema: mergedPipelineBottleneckSchema.nullable(),
      }),
    enabled: isAdmin,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
