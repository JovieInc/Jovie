'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listReleaseSkillClusters,
  listReleaseTaskCatalog,
} from '@/app/app/(shell)/dashboard/releases/catalog-task-actions';
import { STANDARD_CACHE } from '@/lib/queries';

const CATALOG_KEY = ['release-catalog', 'v1'] as const;
const CLUSTERS_KEY = ['release-skill-clusters', 'v1'] as const;

export function useReleaseTaskCatalogQuery() {
  return useQuery({
    queryKey: CATALOG_KEY,
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => listReleaseTaskCatalog(),
    ...STANDARD_CACHE,
  });
}

export function useReleaseSkillClustersQuery() {
  return useQuery({
    queryKey: CLUSTERS_KEY,
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => listReleaseSkillClusters(),
    ...STANDARD_CACHE,
  });
}
