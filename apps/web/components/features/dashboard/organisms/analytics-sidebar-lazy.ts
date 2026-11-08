'use client';

import dynamic from 'next/dynamic';

/**
 * The analytics rails, loaded on demand. The rail only renders when the
 * analytics panel is open, so keeping it out of the audience workspace's
 * first-load JS costs nothing at open time: the chunk is preloaded on idle.
 * `loading` gives each rail its own Suspense boundary, so opening it before
 * the chunk lands leaves the page in place instead of the shell skeleton.
 */
const loadAnalyticsSidebar = () => import('./AnalyticsSidebar');

if (typeof window !== 'undefined') {
  const idle = globalThis.requestIdleCallback ?? globalThis.setTimeout;
  idle(() => {
    void loadAnalyticsSidebar();
  });
}

const loading = () => null;

export const AnalyticsSidebar = dynamic(
  () => loadAnalyticsSidebar().then(mod => mod.AnalyticsSidebar),
  { loading }
);

export const StaticAnalyticsSidebar = dynamic(
  () => loadAnalyticsSidebar().then(mod => mod.StaticAnalyticsSidebar),
  { loading }
);
