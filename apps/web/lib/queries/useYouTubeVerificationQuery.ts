'use client';

import { useQuery } from '@tanstack/react-query';
import type { YouTubeVerificationState } from '@/lib/onboarding/youtube-verification';
import { STANDARD_CACHE } from './cache-strategies';
import { fetchWithTimeout } from './fetch';
import { queryKeys } from './keys';

export interface YouTubeVerificationView {
  readonly state: YouTubeVerificationState;
  readonly channel: { readonly title: string; readonly url: string } | null;
  /** True while the owner is not yet admitted: the benefit of connecting. */
  readonly needsAccess: boolean;
}

export function useYouTubeVerificationQuery(profileId: string) {
  return useQuery<YouTubeVerificationView>({
    queryKey: queryKeys.youtubeVerification.profile(profileId),
    queryFn: ({ signal }) =>
      fetchWithTimeout<YouTubeVerificationView>(
        `/api/dashboard/youtube-verification?profileId=${encodeURIComponent(profileId)}`,
        { signal }
      ),
    enabled: !!profileId,
    ...STANDARD_CACHE,
  });
}
