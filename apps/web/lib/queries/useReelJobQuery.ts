'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateReel,
  getReelJob,
  listReelJobsForRelease,
} from '@/app/app/(shell)/dashboard/releases/reel-actions';

const REEL_JOBS_FOR_RELEASE = (releaseId: string) =>
  ['reel-jobs', 'release', releaseId] as const;
const REEL_JOB = (jobId: string) => ['reel-jobs', 'job', jobId] as const;

export function useReelJobsForReleaseQuery(releaseId: string) {
  return useQuery({
    queryKey: REEL_JOBS_FOR_RELEASE(releaseId),
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => listReelJobsForRelease(releaseId),
    enabled: Boolean(releaseId),
    staleTime: 5_000,
  });
}

export function useReelJobQuery(
  jobId: string | null,
  options: { pollWhilePending?: boolean } = {}
) {
  return useQuery({
    queryKey: jobId ? REEL_JOB(jobId) : ['reel-jobs', 'none'],
    // eslint-disable-next-line @jovie/require-abort-signal -- server action, signal not passable
    queryFn: () => (jobId ? getReelJob(jobId) : Promise.resolve(null)),
    enabled: Boolean(jobId),
    staleTime: 5_000,
    refetchInterval: query => {
      if (!options.pollWhilePending) return false;
      const data = query.state.data;
      if (!data) return 3_000;
      if (data.status === 'queued' || data.status === 'rendering') {
        return 3_000;
      }
      return false;
    },
  });
}

export function useGenerateReelMutation(releaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => generateReel(releaseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REEL_JOBS_FOR_RELEASE(releaseId) });
    },
  });
}
