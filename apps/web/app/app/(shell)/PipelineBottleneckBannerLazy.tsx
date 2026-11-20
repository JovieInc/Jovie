'use client';

import dynamic from 'next/dynamic';

/**
 * Admin-only. Loaded on demand so the banner's query and its zod schema stay
 * out of the home page's first download for every artist. The caller mounts it
 * in a fixed-height slot, so the late arrival never shifts the page.
 */
export const PipelineBottleneckBannerLazy = dynamic(
  () =>
    import('@/components/features/home/PipelineBottleneckBanner').then(
      module => module.PipelineBottleneckBanner
    ),
  { ssr: false, loading: () => null }
);
